# Auditoria de memória e processamento — Launcher + API (out/2026)

Data: 18/10/2026 · Versão auditada: launcher 1.73.0 (`c473524`), API `main` local.
Escopo: processo main do Electron (`electron/main`), renderer (`src/`), janela de sobreposição, comunicação HTTP/Socket.io com `bocas-murchas-api`.
**Nada foi alterado no código nesta etapa.** Complementa `docs/performance-audit-2026-09.md` (o que lá foi feito/descartado não é repetido aqui, salvo se quebrado).

Legenda de classificação:
- **CONFIRMADO** — evidência direta no código (arquivo:linha) e/ou medição.
- **HIPÓTESE** — plausível pelo código, falta medição para atribuir custo.
- **OPORTUNIDADE** — não é defeito; ganho possível com custo/risco baixo.

---

## 1. Diagnóstico executivo

1. **O launcher nunca fica "ocioso" de verdade.** Medido com a janela principal *minimizada*: 1,05 GB privados somando 7 processos e **27,6 % de um núcleo** contínuo (§2). Metade da CPU vem de coisas que rodam mesmo sem ninguém olhando.
2. **Medido (7 cenários, §2): os dois grandes consumidores de CPU são**
   - **Pintura da janela principal visível: ≈ 90 % de um núcleo** (GPU 61–72 % + renderer ~20–30 %) com a tela praticamente parada (sozinho na call, sem vídeo). Some quando a janela vai para a bandeja. Suspeita forte: animações que repintam todo frame (C4). **Prioridade nº 1.**
   - **Gravador de clipes da call: ≈ 7,5 % de um núcleo** contínuo durante toda call, mesmo oculto e no mudo. **Prioridade nº 2.**
   - Mic ativo ≈ 6 pontos (renderer + AudioService) — esperado, já é solto no mudo.
   - Repouso real (fora de call, oculto) é barato: 0,5–0,6 %. A sobreposição fora de call custa sobretudo **RAM (~90 MB)**; polling de cursor e remedição de 150 ms mediram barato. Em call **com** a sobreposição aberta o main sobe (6,8 % na medição 1 vs 0,1 % sem ela) → relé do estado de voz para a sobreposição (C6).
3. **Renderer principal (450 MB, 12 % de CPU minimizado):** sem code splitting (um `index-*.js` de 5,7 MB com todos os jogos); ~34 providers e ~30 hosts globais montados após login; re-renders em cascata durante a call (quem fala → todos os 27 consumidores de `useVoice()`; contexto de clipe muda 1×/s; `useSocket()` mistura socket estável com presença para 40 arquivos); canal de chat aberto nunca é aparado e a lista não é virtualizada (crescimento real com uso prolongado).
4. **Rede/servidor:** cada (re)conexão ressincroniza em dobro; a lista de online inteira (com query no banco) vai para *todos* a cada connect/disconnect; impressão faz polling de 15 s mesmo já tendo push por socket; eventos emitidos que ninguém escuta; faltam índices em `Reaction.messageId` e `Wager.bettorId`; `limit` de mensagens sem teto.
5. **Vazamento real (crescimento sem limite) confirmado: só o canal de chat ativo** (e baldes criados por `handleCreated`). O resto é **retenção desnecessária** (sobreposição viva, modais montados, bundle inteiro carregado) ou **processamento desnecessário** (timers, re-renders). AudioContext do recorte de som (`audio-trim.ts`) fica vivo para sempre — pequeno em RAM, mas segura a saída de áudio aberta.

Ganho esperado: não há percentuais medidos — os números só virão do roteiro do §8. Qualitativamente, as fases 1–2 atacam o consumo **em repouso** (sobreposição + timers + re-renders), que é o que o usuário sente com o launcher na bandeja durante o jogo.

---

## 2. Linha de base medida (e limites)

Coleta: app instalado (1.73.0), aberto desde 17/10 20:35, medido 18/10 08:50 (~12 h15). Janela principal **minimizada** (`IsIconic=True`), sobreposição **visível** em tela cheia, foco no Explorer, Riot Client aberto (sem LeagueClient, sem Minecraft). Há um endpoint UDP no NetworkService e o AudioService está ativo (3,9 %) → **provável call ativa, não confirmado**.

| Processo (inferido pela linha de comando) | Privado MB | WS MB | CPU % de 1 núcleo (janela 60 s) | CPU acumulada (s) |
|---|---:|---:|---:|---:|
| renderer #4 (janela principal — inferido: 1º renderer) | 452 | 210 | 12,2 | 5419 |
| gpu-process | 355 | 183 | 2,1 | 5357 |
| main (browser) | 103 | 117 | 6,8 | 964 |
| renderer #6 (sobreposição — inferido) | 98 | 107 | 2,5 | 399 |
| AudioService | 14 | 91 | 3,9 | 973 |
| VideoCaptureService | 16 | 97 | 0 | 2 |
| NetworkService | 15 | 55 | 0,1 | 52 |
| **Total** | **1054** | — | **27,6** | — |

Observações:
- GPU acumulou ~5357 s em 12 h (~12 % médio), mas na janela de 60 s estava em 2,1 %: o custo da GPU varia com o que está na tela (call, jogo, sobreposição). Precisa de série temporal (§8).
- VideoCaptureService vivo desde 20:36 sem uso visível — ver H3.

**Medição 2 (18/10, ~09:30) — sobreposição fechada pelo usuário, fora de call, janela principal na bandeja (oculta), Riot Client aberto, janela de 90 s:**

| Processo | Privado MB (antes → depois) | CPU % 1 núcleo (antes → depois) |
|---|---|---|
| renderer #4 (principal) | 452 → 421 | 12,2 → 0,5 |
| gpu-process | 355 → 358 | 2,1 → 0 |
| main | 103 → 103 | 6,8 → 0,1 |
| renderer #6 (sobreposição) | 98 → **processo encerrado** | 2,5 → — |
| AudioService | 14 → 13 | 3,9 → 0 (processo continua vivo) |
| VideoCaptureService | 16 → 16 | 0 → 0 (continua vivo) |
| **Total** | **1054 → 926** | **27,6 → 0,6** |

Leitura:
- **Main 6,8 % → 0,1 %**: o main não faz trabalho de call (loopback só compartilhando tela), então isso é atribuível à sobreposição (polling do cursor + `setAlwaysOnTop`, C2). **C2 confirmado por medição.**
- **Renderer principal 12,2 % → 0,5 %**: duas variáveis mudaram juntas (sobreposição e call). Pela natureza do código (detector, gate, gravador de clipes, C5/C7 só existem em call), a maior parte é provavelmente da call — **H2 continua hipótese** até isolar.
- **Sobreposição custava ~98 MB + ~2,5 % de um núcleo** só no seu renderer, mais a parcela do main.
- **GPU não devolveu memória** (355 → 358 MB) ao fechar a sobreposição: o Chromium retém o pool de GPU; a CPU da GPU zerou. Parte do H1 (CPU) confirmada; memória da GPU depende de outra coisa (janela principal/caches) — investigar com `chrome://gpu`/`app.getGPUInfo`.
- **Repouso real é barato**: sem sobreposição e sem call, 0,6 % de um núcleo. O problema de CPU está concentrado em sobreposição + call, não nos timers de fundo.
- Renderer principal segue com ~421 MB oculto e parado → memória retida (bundle, contextos, cache de chat), não processamento. Próximo passo: heap snapshot (H4/H5).

Para separar H2: (a) reabrir a sobreposição fora de call e medir; (b) fechar a sobreposição, entrar em call e medir.

**Medição 3 (18/10, ~09:40) — sobreposição reaberta, fora de call, janela principal oculta, 90 s:**

| Processo | Privado MB | CPU % 1 núcleo |
|---|---:|---:|
| renderer #4 (principal) | 423 | 0 |
| gpu-process | 300 | 0 |
| main | 104 | 0,4 |
| renderer #11 (sobreposição, recriada) | 88 | 0,2 |
| Audio / VideoCapture / Network | 13 / 16 / 15 | 0 |
| **Total** | **958** | **0,6** |

**Correção da leitura da medição 2:** com a sobreposição aberta e **fora de call**, o main fica em 0,4 % e a sobreposição em 0,2 %, mesmo com o polling de 50 ms rodando (ele roda sempre que a janela existe: `overlay.ts:358-361,496`). Logo, **os 6,8 % do main na medição 1 não vinham do polling do cursor**, e sim de algo que só acontece em call (hipótese: relé de estado da sobreposição a cada mudança de fala — C6 — passando pelo main, IPCs de voz/clipe/hotkeys; ou `ov-halo`/`animate-pulse` da sobreposição, que só aparecem em call). Reclassificação:
- **C2 (polling do cursor):** existe, mas medido **barato** fora de call (~0,4 % somando tudo do main). Rebaixado a oportunidade.
- **C1 (sobreposição sempre viva):** custo fora de call é sobretudo **RAM (~88–98 MB)**, CPU desprezível. Continua válido como ganho de memória, não de CPU.
- **CPU alta (27,6 %) é da call** espalhada por renderer principal, main, sobreposição, AudioService e GPU → C5, C6, C7 e o caminho renderer→main→sobreposição sobem de prioridade.
- GPU caiu de 358 para 300 MB após reabrir a sobreposição: a memória da GPU flutua com o que o compositor aloca, não acompanha linearmente as janelas.

**Medição 4 (18/10, ~09:50) — em call, sobreposição fechada, janela principal VISÍVEL (não minimizada, sem foco), 90 s:**

| Processo | Privado MB | CPU % 1 núcleo |
|---|---:|---:|
| renderer #4 (principal) | 450 | **34,0** |
| gpu-process | 314 | **72,2** |
| main | 104 | 0,1 |
| AudioService | 14 | 1,6 |
| NetworkService | 15 | 0,9 |
| **Total** | **912** | **108,7** |

Leitura: com a janela visível em call, GPU + renderer passam de 1 núcleo inteiro. Main fica em 0,1 % → **os 6,8 % do main na medição 1 dependem da combinação call + sobreposição** (relé do estado de voz para a sobreposição, C6). O estado da tela (palco da call, vídeo/tela assistida, animações) ainda precisa ser identificado; comparar com a mesma call minimizada.

Tela no momento da medição 4 (captura do usuário): **sozinho na call** (canal "negócios"), versão em execução **1.74.0** (não 1.73.0 como suposto no cabeçalho), palco com 1 tile de borda verde brilhante, avatar com moldura rosa e coroa, nome "Felix" com efeito de nome em 4 lugares (sidebar de voz, palco, barra inferior, ranking), painel de Ranking aberto com molduras. Sem vídeo, sem tela compartilhada, sem câmera. Tela praticamente estática → os 72 % de GPU + 34 % de renderer são **pintura contínua** (forte indício de C4: `name-flow`/molduras/brilhos repintando todo frame). Ainda hipótese até isolar a animação.

**Medição 5 (18/10, ~10:00) — mesma call (sozinho), sobreposição fechada, janela oculta (minimizar mandou para a bandeja), 90 s:**

| Processo | Privado MB | CPU % 1 núcleo |
|---|---:|---:|
| renderer #4 (principal) | 446 | **12,5** |
| gpu-process | 337 | 0,1 |
| main | 105 | 0 |
| AudioService | 14 | 3,0 |
| **Total** | **933** | **16,3** |

Leitura:
- **Visível − oculto na mesma call ≈ 92 pontos de núcleo** (GPU 72 → 0,1; renderer 34 → 12,5) → custo de pintar a janela, não da call.
- **Oculto em call, sozinho: renderer 12,5 %.** Sem ninguém falando, as cascatas C5/C6 quase não disparam; sobra o pipeline de áudio local: gate do mic (~100 Hz), detector de fala (60 ms), gravador de clipes (3 MediaRecorder codificando contínuo + tick 1 s) — **H2 parcialmente confirmada** (a call custa ~12 % mesmo sozinho e oculto); falta dividir entre os três.
- Fora de call e oculto: 0,5 % (medição 2). Diferença ≈ 12 pontos = custo base da call.

**Medição 6 (18/10, ~10:10) — mesma call, sozinho, oculta, sobreposição fechada, MIC MUDO (buffer de clipes ainda ligado), 90 s:** renderer 9,3 % (era 12,5), AudioService 0,2 % (era 3,0), GPU 0,1, main 0,1 → total **9,8 %**, 943 MB.
- Mudo solta o mic (release do gate, `audio-processor.ts:418`): **mic ≈ 3 pontos no renderer + ~3 no AudioService**.
- Sobram **~9 % no renderer** com mic mudo, ninguém falando e janela oculta. Candidatos: gravador de clipes (3 MediaRecorder + AudioContext, só desliga com mudo **e** ensurdecido), detector de fala (60 ms), pilha do LiveKit. Próximo isolamento: desligar o buffer de clipes.

**Medição 7 (18/10, ~10:25) — mesma call, sozinho, oculta, mic mudo, BUFFER DE CLIPES DESLIGADO, 90 s:** renderer **1,8 %** (era 9,3), GPU 0,1, main 0,2, AudioService 0 → total **2,2 %**, 912 MB.
(Uma tentativa intermediária com a janela visível e em foco deu 97,9 % — GPU 61, renderer 32 — confirmando que o custo da janela visível independe do buffer de clipes.)

**Decomposição da CPU da call (sozinho, janela oculta):**

| Componente | Pontos de % de 1 núcleo | Evidência |
|---|---:|---|
| Gravador de clipes (3 MediaRecorder + AudioContext + tick 1 s) | **≈ 7,5** | medição 6 → 7 |
| Mic (gate + captura + envio) | ≈ 3 renderer + ≈ 3 AudioService | medição 5 → 6 |
| Resto da call (detector de fala, LiveKit, timers) | ≈ 1,3–1,7 | medição 7 − medição 2 |
| **Pintura da janela visível** (independe da call ativa ou do buffer) | **≈ 90** (GPU 61–72 + renderer ~20–30) | medição 4 vs 5; tentativa visível |

**Correção do relatório de set/2026:** lá o gravador de clipes foi "verificado e deixado" como barato (3 gravadores numa mistura só). Medido agora, ele é **o maior custo da call com a janela oculta** (~7,5 % de um núcleo, contínuo enquanto houver call). Vira item de correção (§6, 1.13).

**Medição 8 (18/10, ~10:40) — janela principal visível e em foco, em call, "Efeitos de animação" do Windows DESLIGADO (→ `prefers-reduced-motion: reduce`), 90 s:** GPU **10,7 %** (era 61–72), renderer 20,4 % (era 32–34), main 3,7 %, AudioService 5,7 %, renderer #12 novo (72 MB, 3,4 %) → total 44,3 %, 1096 MB.
Variáveis que mudaram junto (não controladas): **cliente do LoL abriu** (polling LCU de 2 s → main 3,7 %), mic aberto (AudioService 5,7), buffer de clipes provavelmente religado, um renderer extra (#12, não identificado — provável sobreposição/painel aberto pelo LoL).
Leitura: mesmo com mais carga em volta, a **GPU caiu ~50–60 pontos** só com reduced-motion → **C4 confirmado por medição: o custo da janela visível são animações CSS infinitas.** As que reduced-motion desliga e que estão na tela da captura: `frame-supreme::before` (moldura rosa com coroa; custom property animada em conic-gradient + máscara, `effects.css:353,413-418`), `name-flow` (nome "Felix" em 4 lugares, `effects.css:504-506`), `.fx-supreme .fx-spark`, `rarity-supreme-card::before` (`:491-494`), `fx-fire`/`frame-fire` (`:445-453`), tema aurora `body::after` (`globals.css:707-709`) e as utilitárias Tailwind. **Nenhuma delas, exceto as utilitárias, está na lista `html.game-running`** (`globals.css:1274-1281`) — ou seja, essas animações também rodam durante o jogo. Qual pesa mais entre elas ainda é hipótese (suspeita principal: `frame-supreme`, por ser pintada no main thread a cada frame); isolar com §8.5 passo 2.

### Depois das correções 1.13 (parcial) e 1.14 (a, b)

Build de produção local (`electron-vite build` + `preview`), app recém-aberto, mesma máquina, sozinho na call, **mic aberto**, sobreposição fechada, Riot Client aberto.

| Cenário | Antes | Depois |
|---|---|---|
| Janela visível sem foco (medição 4 → 9): GPU / renderer / total | 72,2 / 34,0 / **108,7 %** | 2,8 / 6,1 / **9,9 %** |
| Janela na bandeja (medição 5 → 10): renderer / AudioService / total | 12,5 / 3,0 / **16,3 %** | 3,9 / 0,3 / **5,0 %** |

- Memória privada total 833–858 MB, mas com app recém-aberto: **não comparável** com as 12 h da medição 1 (o efeito em memória destas correções é nulo por desenho).
- Queda do AudioService (3,0 → 0,3) com mic aberto não está explicada; o gravador de clipes desligado sozinho na call é o candidato, mas a medição 6 (mudo, clipes ligados) já tinha 0,2. Fica em aberto.
- Visual conferido pelo usuário: molduras/nomes congelam ao tirar o foco e voltam ao retomar.
- O ganho do 1.13 vale **só sozinho na call**; com amigos os 3 gravadores continuam (~7,5 %), pendente da troca por codificador único.

Falta (b): call com a sobreposição fechada, e depois call com a sobreposição aberta, para dividir a CPU da call entre o app e a sobreposição.

**Limites desta etapa:**
- Medi uma única foto de um app de longa duração, sem uma linha de base fresca (boot) para comparar. Não reiniciei o app do usuário (poderia derrubar uma call).
- Não tenho DevTools/heap snapshot do app instalado; atribuição renderer→janela é inferida.
- Não medi o servidor (VPS) nem tráfego por evento. Achados de API são por leitura de código.
- Cenários não medidos: boot, navegação, abrir/fechar página repetido, retorno ao primeiro plano, em jogo. Roteiro no §8.

---

## 3. Arquitetura e mapa de carregamento

### 3.1 Processos

| Processo | O que roda | Quando nasce | Quando morre |
|---|---|---|---|
| main (`electron/main/index.ts`) | IPC, LoL LCU (`lol.ts`, `lol-discovery.ts`), status do servidor MC (`server-status.ts`, 30 s), sobreposição (`overlay.ts`), updater (30 min), bandeja, atalhos, loopback de áudio (`bm-loopback.exe`) | boot | sair |
| renderer principal | app React inteiro (`index.html`) | boot | sair (fechar = esconder na bandeja, `index.ts:133-145`) |
| renderer sobreposição | `OverlayPage` (bundle `overlay-*.js`, 80 KB) | boot se `overlay.enabled` (`index.ts:243`, `overlay.ts:690`) | só quando o usuário minimiza a sobreposição (`overlay.ts:572-581`) |
| renderer popout | outra cópia completa do `index.html`, `backgroundThrottling:false` (`popout.ts:71-91`) | sob demanda | ao fechar |
| splash | transparente, sandbox | boot (se não iniciar oculto) | fecha após carregar |
| GPU / Audio / VideoCapture / Network | serviços do Chromium | sob demanda do Chromium | quando o Chromium solta |

Flags do Chromium: só WGC (`index.ts:57-60`) e `disable-features=MediaFoundationVideoCapture` (`index.ts:79`). Sem `--js-flags`, sem flags de GPU.

### 3.2 Renderer: carregamento

- **Tudo é eager.** `src/App.tsx:38-47` importa as 10 páginas e `:48-88` cerca de 40 componentes globais. Nenhum `React.lazy` em `src/`. Build: `out/renderer/assets/index-zuRzNj2e.js` = **5,68 MB** (sem `manualChunks` no `electron.vite.config`). `emoji-picker-react` é importado no topo de 5 arquivos.
- **Antes do login:** 8 providers (`App.tsx:472-480`).
- **Depois do login:** `AuthedLayout` (`App.tsx:365-427`) monta mais 26 de uma vez: socket, members, cargos, chat, voice, activity, afk, soundboard, nudge, clip, hotkeys, overlay, layout, emoji, gamification, costs, pendencias, party, poker, cartas, board, smoke, watch, richtext, print.
- **Hosts globais sempre montados:** `GlobalOverlays` (`App.tsx:236-317`), ~30 itens (MusicHost, EggLayer, OverlayBridge, OverlayFeed, DropHost, ~30 modais). Modais como ShopModal/AchievementsModal retornam `null` fechados, mas seus hooks (`useMembers`, `useGamification`) continuam rodando e re-renderizando.
- **Páginas não ficam retidas:** rotas desmontam ao sair; `SocialPage.tsx:143-147` desmonta VoiceStage/ChatView na troca de aba. MusicHost só tem iframe com sessão de música ativa (`MusicHost.tsx:84`). **O que fica retido são os dados nos contextos**, não o DOM das páginas.

### 3.3 Ciclo de vida dos recursos principais

| Recurso | Criado | Ativo | Suspenso | Liberado |
|---|---|---|---|---|
| Janela sobreposição + polling cursor 50 ms (`overlay.ts:169,360`) | boot | **sempre** | nunca | usuário minimiza a sobreposição |
| Remedição de hit-areas 150 ms (`OverlayPage.tsx:107,770-800`) | boot da sobreposição | sempre | nunca | idem |
| Relógio 1 s da sobreposição (`OverlayPage.tsx:125-131`) | idem | sempre | nunca | idem |
| Status do servidor MC 30 s → IPC para todas as janelas (`server-status.ts:28,194-235`) | boot | sempre | nunca | sair |
| LoL: descoberta 30 s com `tasklist` (`lol-discovery.ts:118-130`) / polling 2 s com cliente aberto (`lol.ts:71,377`) | boot | sempre | backoff só sem cliente | sair |
| Socket.io (1 instância, `socket-context.tsx:143`) | login | sempre | — | logout / troca de token (recria: `:450`) |
| Sala LiveKit + AudioContext da mistura (`voice-context.tsx:1109-1114`) | entrar na call | call | suspenso ao ensurdecer (`:965`) | sair (`:1024,1569,2364`) |
| Detector de fala (AudioContext próprio, analyser por pessoa, 60 ms; `speaking-detector.ts:69,158`) | 1ª faixa de áudio | call, **inclusive com janela oculta** | só sem ninguém medido (`:136`) | sair (`voice-context.tsx:1011`) |
| Gate do mic (AudioContext, ~100 Hz; `audio-processor.ts:216,373`) | mic ligado | mic ligado | mudo (`:418`) | `:459` |
| Gravador de clipes (AudioContext + 3 MediaRecorder; `clip-recorder.ts:104-175`) + tick React 1 s (`clip-context.tsx:203`) | call com `clipBuffer` | call inteira | só mudo+ensurdecido | sair/desligar (`:206-214`) |
| `getStats` 5 s (`voice-context.tsx:1868`) | call | visível | oculto | sair |
| AudioContext do recorte (`audio-trim.ts:50-52`) | 1º recorte de som | **para sempre** | nunca | nunca |
| Player YouTube: drift + `infoDelivery` (`use-youtube-player.ts:257-261,365`) | sessão de música/watch | tocando | **não pausa oculto** | fim da sessão |
| Polling `/print/state` 15 s (`print-context.tsx:35,75`) | login | visível | oculto | logout |
| Polling apostas ao vivo 30 s (`gamification-context.tsx:122,484`) | painel aberto ou alguém em jogo | idem | oculto só se sobreposição desligada (intencional) | — |
| Custos 1 h, auth 1 h, afk 30 s, ovos 10 s, estátua 60 s, deaf/alone 30 s | login | sempre | não | logout |
| Cache de mensagens (`chat-context.tsx`) | abrir canal / `handleCreated` | sempre | apara a `CACHE_KEEP` só na troca de canal e **nunca o canal ativo** | logout |

Verificado e OK: todo `socket.on` (79) tem `off`; todo `on()` do preload devolve unsubscribe (`preload/index.ts:7-8`); log do Minecraft limitado a 1200 linhas (`launcher.ts:34`); `lol:status` e estado da sobreposição só são enviados quando mudam; observers e object URLs são liberados (EmojiManager, clipes, soundboard, câmera da impressão); PoolCanvas só faz rAF com bolas em movimento; soundboard não pré-carrega buffers.

---

## 4. Gargalos

### 4.1 Confirmados

| ID | Problema | Evidência | Custo | Quando |
|---|---|---|---|---|
| C1 | Sobreposição transparente em tela cheia, sem throttling, viva o dia todo | `overlay.ts:455-484` (`transparent`, `backgroundThrottling:false`), `:400-411` tamanho do monitor, `:665-690`; janela medida visível 2560×1079 | GPU/DWM, CPU, ~98 MB + parte da GPU | sempre |
| C2 | Polling do cursor a 20 Hz no main + `setAlwaysOnTop`/`moveTop` a cada 1,5 s; `GetAsyncKeyState` via koffi com painel aberto | `overlay.ts:169,254-301,358-361,198,203-207,271-274` | CPU do main (medido 6,8 % minimizado) | enquanto a sobreposição existe |
| C3 | Remedição de layout a cada 150 ms (`querySelectorAll` + `getBoundingClientRect` + `JSON.stringify`) e relógio 1 s re-renderizando a página toda | `OverlayPage.tsx:107,770-800,125-131` | CPU do renderer da sobreposição | sempre |
| C4 | Animações infinitas fora da lista `game-running`: `fx-fire`/`name-flow` animam `background-position` (repinta todo frame; comentário em `effects.css:124` está errado), `frame-supreme::before` (custom property em conic-gradient + máscara), `frame-fire(-lg)`, camada de luz do tema aurora (150 % da janela); na sobreposição `ov-halo` (box-shadow) e `animate-pulse` — e a classe `game-running` nem existe na janela da sobreposição | `globals.css:1274-1281` (lista atual), `effects.css:128,255,274,353,504`, `globals.css:701,941`, `overlay/Tabs.tsx:179,205`, `activity-context.tsx:381` (só a janela principal) | GPU + main thread | sempre que visíveis; sidebar de voz (`ChannelSidebar.tsx:493`) fica sempre montada |
| C5 | Quem está falando re-renderiza todos os consumidores de `useVoice()` (27 arquivos, 8 providers), inclusive oculto | `voice-context.tsx:930-948` (`isSpeaking` dentro de `participants`), valor memoizado em `:2381` | CPU | call |
| C6 | OverlayBridge serializa o estado inteiro a cada mudança de fala | `overlay-bridge.tsx:242,309-313` | CPU | call |
| C7 | Contexto de clipe muda 1×/s a call inteira (`bufferedMs` nunca estabiliza: 3 slots defasados de 10 s), só para calcular `canClip > 3000` | `clip-context.tsx:79,203,379`; `clip-recorder.ts:47-52,238-242` | CPU (re-render de Hotkeys, OverlayBridge, Composer, ClipsPanel) | call, oculto ou não |
| C8 | `useSocket()` junta o socket (estável) com toda a presença | `socket-context.tsx:110-133,463`; 40 consumidores | CPU a cada evento de presença/atividade/LoL | sempre |
| C9 | **Crescimento sem limite:** canal ativo nunca é aparado; `handleCreated` cria baldes para canais nunca abertos; lista do chat não virtualizada; barra de ações (Popover, Hint, botões) montada em cada mensagem com `opacity-0` | `chat-context.tsx:964-975` (pula `activeChannelId`), `:551-555`; `ChatView.tsx:507`; `MessageItem.tsx:433-483` | RAM + DOM, cresce com o uso | sempre |
| C10 | Timer de "digitando" cria array novo todo segundo → re-render do chat inteiro | `chat-context.tsx:884` (`prev.filter` sempre novo) | CPU | enquanto alguém digita |
| C11 | `MessageItem` sem `React.memo`, `onStopEdit` inline, cada item lê 4 contextos | `MessageItem.tsx:94,109-115`; `ChatView.tsx:531` | CPU × N mensagens | qualquer mudança de presença/settings |
| C12 | Bundle único de 5,68 MB, sem `React.lazy`; jogos, impressão, admin e picker carregados no boot | `App.tsx:38-88`; `out/renderer/assets/index-zuRzNj2e.js` | RAM fixa (código compilado V8) + tempo de boot | sempre |
| C13 | AudioContext do recorte de som nunca suspenso/fechado | `audio-trim.ts:50-52` | thread de áudio + segura a saída aberta (PC não dorme; mesmo problema já tratado em [voice-power]) | após 1º recorte |
| C14 | YouTube: `setCurrentTime` a cada `infoDelivery`, mesmo oculto | `use-youtube-player.ts:259` | CPU | música/watch tocando |
| C15 | Status do servidor MC: payload inteiro (com favicon) a cada 30 s para **todas** as janelas; `fetchedAt` muda sempre → re-render do contexto mesmo na bandeja | `server-status.ts:28,194-197,228-235`; `server-status-context.tsx:39` (valor sem memo) | CPU + IPC | sempre |
| C16 | Descoberta do LoL sem cliente faz `tasklist` a cada 30 s (~1440 processos/12 h); com cliente aberto faz polling de 2 s até no lobby ocioso | `lol-discovery.ts:118-130`; `lol.ts:71,377` | CPU (spawn) | sempre / com Riot aberto |
| C17 | Imagens do chat decodificadas em resolução nativa (exibidas ≤ 448×320), sem `decoding="async"` nem dimensões | `MessageItem.tsx:653` | RAM (bitmaps decodificados) | imagens visíveis |

**API / rede (confirmados por código):**

| ID | Problema | Evidência | Impacto |
|---|---|---|---|
| A1 | Toda (re)conexão ressincroniza 2×: servidor já envia `userOnline`/`voiceState` no connect e o cliente pede `requestPresence`/`requestVoiceState` de novo | servidor `server.ts:1067,1078,1081,1089-1096`; cliente `socket-context.tsx:165-172` | servidor (2× query) + rede |
| A2 | Lista de online **inteira**, com `findMany`, vai por `io.emit` a cada connect/disconnect | `server.ts:858,981-992,1067`; `pingInterval/pingTimeout` 10 s (`:161`) | servidor + rede + re-render de todos os clientes (via C8) |
| A3 | Polling `/print/state` 15 s apesar de `print:*` já empurrar (comentário em `print-context.tsx:13` desatualizado) | `print-context.tsx:35,75,143-148` | servidor + rede |
| A4 | Eventos de impressão (`print:telemetry` ~5 s imprimindo, `print:queue`, `print:job`) para todos; cada um faz **todos** refazerem `GET /print/state` | API `job-state.ts:74-94,489`; cliente `print-context.tsx:90` | rede + servidor + CPU cliente |
| A5 | Eventos sem ouvinte: `gamification:house` (com upsert no banco por broadcast), `mapPing*`, `voiceChannelUsers` | `house.ts:58`, `map-pings.routes.ts:70,121,154`, `server.ts:1208` | servidor + rede |
| A6 | Lobbies de jogos (`board/poker/cartas:lobby`) por `io.emit` a cada jogada, snapshot inteiro | `board/table.ts:320-357` (idem poker/cartas) | rede + CPU cliente |
| A7 | Sem índice em `Reaction.messageId` (o único é `@@unique([userId,messageId,emoji])`) — carregado em toda página de mensagens | `message-include.ts:11`, `schema.prisma` | servidor (scan) |
| A8 | Sem índice em `Wager.bettorId` | `wagers.ts:362`, `board/money.ts:154` | servidor |
| A9 | `limit` das mensagens sem teto (`take: Number(limit)`) | `message.routes.ts:174` | servidor/memória |
| A10 | `request()` sem dedup de requisições em voo nem `AbortController`; cache de perfil não cobre chamadas em voo | `api.ts:65-87`; `gamification-context.tsx:536-544` | cliente + rede |
| A11 | Renovação de token recria o socket e refaz members/gamification/costs/print | `socket-context.tsx:450` (deps `[token]`) | raro (< 2 dias de validade) |
| A12 | Reconexão dispara ~7 handlers `connect` independentes (chat: `refreshChannels`, `refreshConversations`, `resyncAfterGap`) | `chat-context.tsx:843-847`, pendencias `:158` | rede + servidor em rajada |

### 4.2 Hipóteses (precisam de medição)

| ID | Hipótese | Como obter a evidência |
|---|---|---|
| H1 | A maior parte da CPU/RAM do processo GPU vem da sobreposição transparente (DWM recompõe a janela layered do tamanho do monitor) | 1 h com sobreposição minimizada vs 1 h normal, mesma situação (sem jogo, sem call): CPU‑s e privado do `gpu-process` (script do §8) |
| H2 | Os 12 % do renderer principal minimizado vêm da call: 4+ AudioContexts (mistura, detector, gate, clipe) + 3 MediaRecorder do clipe + C5/C7 | repetir a amostra de 60 s em 4 estados: sem call / call / call mudo+ensurdecido / call com clipe desligado |
| H3 | VideoCaptureService (e talvez `bm-loopback.exe`) sobra depois de compartilhar tela quando a faixa termina sozinha (sem `screen:loopback-stop`, `ipc.ts:351`; main só para em `process-loopback.ts:183-186`) | compartilhar, encerrar pelo "Parar compartilhamento" do Windows, conferir processos |
| H4 | Parte dos 450 MB é código compilado do bundle (C12) e não dados | heap snapshot logo após o boot vs após 6 h; aba "Statistics" (code vs strings vs arrays) |
| H5 | Crescimento contínuo do renderer com chat aberto (C9) | 2 heap snapshots com 6 h de intervalo: contagem de objetos `ChatMessage`, `HTMLDivElement` destacados |
| H6 | `activity:set` emitido a cada tick do LoL em jogo (`activity-context.tsx:211`, `lol.ts:71`) | contar emits no DevTools → Network → WS durante uma partida |
| H7 | API responde JSON sem gzip (sem `compression` no package.json; nginx não conferido) | `curl -sI -H 'Accept-Encoding: gzip' https://api.bocasmurchas.com.br/...` |
| H8 | Popout abre seu próprio socket/LiveKit (cópia completa do app) | abrir popout e ver conexões WS no DevTools dele |

### 4.3 Oportunidades

- O1: Analisadores do detector de fala pendurados no AudioContext da mistura, em vez de um contexto próprio. **Cuidado:** histórico de voz robotizada ao forçar sample rate ([voice-power-requests]). Fazer só depois de H2.
- O2: Molduras/nomes animados no chat são intencionais (avatar ≥ 32 px), mas podem pausar fora da área visível (`IntersectionObserver` → `fx-static`, ou `content-visibility`) e após N minutos sem input.
- O3: Miniatura no servidor para imagens do chat (original só no lightbox) — completa C17.
- O4: Cache curto (≈5 s) no servidor para `liveWagerBoards` (`wagers.ts:804`), compartilhado entre clientes.
- O5: Tabela de jogo enviada como diff/jogada + seq (`board/table.ts:330`). Risco alto; baixa prioridade.
- O6: Loopback de áudio: lotear chunks de stdout em ~20 ms (`process-loopback.ts:108`); cachear o pid do AudioService em vez de `app.getAppMetrics()` a cada 2 s (`:175-187`).
- O7: Menu da bandeja reconstruído sem mudança (`tray.ts:182-186,225-228`).
- O8: Escutar `gamification:house` no cliente e alongar o polling de 30 s das apostas ao vivo.

### 4.4 Classificação de memória

| Categoria | Itens |
|---|---|
| Necessária | sala LiveKit, AudioContexts da call enquanto ativos, socket, dados do canal visível, bundle da sobreposição quando em jogo |
| Cache útil | `CACHE_KEEP` dos canais fechados, cache de perfis, cache de som do supremo (limitado por membro), lista de clipes (50, URLs revogadas) |
| Retenção desnecessária | sobreposição fora de jogo (C1), código de jogos/admin/impressão no boot (C12), modais fechados montados, barra de ações por mensagem, AudioContext do recorte (C13) |
| Vazamento real (cresce sem limite) | canal ativo + baldes de `handleCreated` (C9) |

---

## 5. Comportamento esperado por estado

| Estado | Deve continuar | Deve parar / reduzir | Ao retomar |
|---|---|---|---|
| **Primeiro plano, ativo** | tudo que a tela mostra; animações decorativas | — | — |
| **Primeiro plano, ocioso (sem input por N min)** | socket, call, notificações | animações decorativas infinitas (O2) | primeiro input religa |
| **Janela oculta / minimizada / bandeja** | socket (presença, mensagens → badge/notificação), call (áudio, detector só se a sobreposição mostra anéis), música tocando, LoL watcher, updater | relógios (já para via `use-now`), `getStats` (já para), `setCurrentTime` do YouTube (C14), tick do clipe (C7), polling de impressão (já para), re-render do status MC (C15), timers de UI (ovos, estátua) | `visibilitychange` → um resync único e debounced (A12) do que pode ter mudado: canal ativo (`resyncAfterGap`), presença, impressão. Não perde dados porque socket segue conectado; o que é só visual é recalculado |
| **Em jogo (Minecraft/LoL)** | sobreposição completa (polling rápido), call | `game-running` também na sobreposição; todas as animações infinitas (C4) | sai do jogo → animações voltam |
| **Sem jogo e sobreposição sem nada para mostrar** | — | janela da sobreposição destruída ou reduzida à área do dock; polling do cursor a ~200 ms ou zero (C1/C2) | jogo detectado, roda aberta ou toast pendente → recria/expande |
| **Tela bloqueada / suspensão** | socket reconecta sozinho | polling do cursor, LoL polling, status MC (`powerMonitor` `lock-screen`/`suspend`) | `unlock-screen`/`resume` → retoma timers + resync único |

Regra de segurança: **suspender só o que é derivado ou visual**. Nada que seja fonte de verdade (mensagens, eventos de apostas, filas) pode depender de polling pausado sem que o socket cubra; onde o socket cobre (impressão, custos), o polling vira rede de segurança longa.

---

## 6. Plano priorizado

Esforço: P (< 1 h), M (meio dia), G (≥ 1 dia). Risco = risco de regressão.

### Fase 1 — Correções imediatas (baixo risco, isoladas)

| # | Ação | Ataca | Esforço | Risco | Validação / critério de pronto |
|---|---|---|---|---|---|
| 1.1 | `setTyping`: devolver `prev` quando o filtro não remove nada | C10 | P | nenhum | React Profiler: 0 commits/s do chat com alguém digitando parado |
| 1.2 | Clipe: guardar `canClip` (booleano) em vez de `bufferedMs`; não atualizar com `document.hidden` | C7 | P | baixo | Profiler: sem commit periódico de 1 s durante a call |
| 1.3 | `audio-trim`: suspender o AudioContext ao desmontar o AudioTrimmer | C13 | P | baixo | `powercfg /requests` (admin) sem o launcher em SYSTEM depois de recortar um som |
| 1.4 | YouTube: com `document.hidden`, gravar tempo só em `timeRef` | C14 | P | baixo | Profiler oculto com música: sem commits por `infoDelivery` |
| 1.5 | `server-status`: enviar só à janela principal (e popout, se usar), comparar sem `fetchedAt`/`latencyMs`, favicon só quando mudar; memoizar valor do `ServerStatusProvider` | C15 | P | baixo | IPC/commit só quando muda algo visível |
| 1.6 | Ampliar `html.game-running` para `fx-fire`, `name-flow`, `frame-supreme`, `frame-fire(-lg)`, aurora; corrigir comentário de `effects.css:124`; `animated={false}` na sidebar de voz | C4 | P | baixo | em jogo: DevTools → Rendering → "Paint flashing" sem repaint periódico; CPU GPU‑process menor (§8) |
| 1.7 | Sobreposição: propagar `game-running` (ou `ov-halo` via `opacity` em pseudo-elemento) | C4 | P | baixo | idem na janela da sobreposição |
| 1.8 | API: remover `requestPresence`/`requestVoiceState` do `handleConnect` (ou só em reconexão sem snapshot) | A1 | P | baixo | log do servidor: 1 `onlineUserList` por connect |
| 1.9 | API: remover emits sem ouvinte (`gamification:house` ou passar a escutá-lo, `mapPing*`, `voiceChannelUsers`) | A5 | P | baixo | grep sem emits órfãos; WS frames menores |
| 1.10 | API: `@@index([messageId])` em `Reaction`, `@@index([bettorId])` em `Wager`; clamp de `limit` ≤ 100 | A7–A9 | P | baixo (projeto usa `db push` — conferir caminho de deploy do schema) | `EXPLAIN QUERY PLAN` usa índice |
| 1.11 | Polling de impressão 15 s → 60–120 s (ou só desconectado); atualizar comentário `print-context.tsx:13` | A3 | P | baixo | contagem de `GET /print/state` por hora |
| 1.12 | LoL: 5 s em `none`/`lobby`, 2 s de champ select em diante | C16 | P | baixo | lobby atualiza em ≤ 5 s; menos CPU do main com Riot aberto |
| 1.13 | **Gravador de clipes** (medido ≈ 7,5 % de um núcleo): curto prazo — não gravar quando ninguém fala (mic mudo **ou** sozinho na call, não só mudo+ensurdecido), e trocar o tick 1 s por booleano (1.2). Médio prazo — substituir os 3 MediaRecorder defasados por um ring buffer PCM (worklet ou ScriptProcessor no AudioContext da mistura, int16, 30 s ≈ 5,8 MB estéreo 48 kHz) e codificar só ao salvar o clipe | medição 6→7 | M | médio (clipe tem que continuar saindo igual; testar atalho com mic aberto/fechado) | medição 6 repetida: renderer oculto em call sozinho ≤ ~2 % com buffer ligado; clipe salvo toca com 30 s |
| 1.14 | **Animações infinitas (confirmado na medição 8):** (a) espelhar em `html.game-running` exatamente os seletores dos blocos `prefers-reduced-motion` de `effects.css`/`globals.css` (`frame-supreme::before`, `name-flow`, `fx-spark`, `rarity-supreme-card::before`, `fx-fire`, `frame-fire*`, aurora `body::after`); (b) nova classe `html.idle-motion` aplicada quando a janela perde o foco ou após N min sem input, com a mesma lista; (c) reescrever `frame-supreme` e `name-flow` para animar só `transform`/`opacity` (camada composta) em vez de custom property/`background-position` | medição 4 vs 8 | P (a, b) / M (c) | baixo (a, b) / médio (c: visual de item pago, validar com o dono) | janela visível sozinho na call sem foco: GPU-process ≤ ~10 %; com foco, após (c), próximo disso |

### Fase 2 — Melhorias intermediárias

| # | Ação | Ataca | Depende de | Esforço | Risco | Validação |
|---|---|---|---|---|---|---|
| 2.1 | **Medir H1/H2 antes** (script §8) | — | — | P | — | tabela comparativa registrada no doc |
| 2.2 | Sobreposição sob demanda: só existe com jogo, roda aberta ou toast pendente; fora disso destruída ou com bounds só do dock (o flicker antigo só valia para redimensionar no meio do jogo). Logo ocioso vira opção de produto | C1 | 2.1 | M | médio (mudança de produto: o "sempre ligado") | sem jogo: renderer da sobreposição ausente; GPU‑process e main caem (§8); em jogo, sobreposição abre em < 1 s |
| 2.3 | Polling do cursor adaptativo: ~200 ms fora de jogo/sem painel, 50 ms perto de hit-area; `setAlwaysOnTop/moveTop` só em jogo; pausar em `lock-screen`/`suspend` | C2 | — (complementa 2.2) | M | baixo‑médio (hover mais lento fora de jogo) | CPU do main minimizado/sem jogo; testes manuais do "clique morto" ([overlay-click-debugging]) |
| 2.4 | `OverlayPage`: `ResizeObserver` + `transitionend` no lugar dos 150 ms (manter timer curto só por alguns segundos após mudança de modo/painel aberto); relógio 1 s só com countdown visível | C3 | — | M | médio (o timer foi a correção do "clique morto": comentário `:770-777`) | arrastar/animar painel sem retângulo velho; 0 layouts periódicos no Performance |
| 2.5 | Chat: aparar canal ativo a ~300 quando rolado até o fim (e em `visibilitychange`), cap dentro de `handleCreated`; `content-visibility:auto` + `contain-intrinsic-size` nas linhas | C9 | — | M | médio (âncora de rolagem ao carregar antigas) | heap 6 h: `ChatMessage` estável; scroll para cima continua buscando do servidor |
| 2.6 | `MessageItem`: `React.memo`, `onStopEdit` estável, `author` vindo do pai; barra de ações montada só em hover/foco | C11, C9 | — | M | baixo | Profiler: mudança de presença não re-renderiza N itens; menos nós no DOM |
| 2.7 | `React.lazy` + Suspense para Poker, Cartas (Truco/Cacheta), Board/Pool/Xadrez/Dama, Impressão, LoL, Admin, Shop, Achievements, Wrapped; picker de emoji lazy dentro do Popover; `{open && <Modal/>}` em `GlobalOverlays` | C12 | — | M | baixo | bundle inicial < atual (medir); heap pós-boot menor (H4); cada rota abre normalmente |
| 2.8 | `server-status` e LoL discovery: `CreateToolhelp32Snapshot` via koffi no lugar de `tasklist` | C16 | — | M | baixo | zero `tasklist.exe` no Process Monitor |
| 2.9 | Eventos de impressão para uma sala `print` (quem está na página/badge) ou dados no próprio evento; lobbies só quando o resumo visível muda (hash) ou sala `lobby:<jogo>` | A4, A6 | — | M | baixo‑médio | frames WS por cliente fora da página de impressão/salão ≈ 0 |
| 2.10 | Dedup de GET em voo (mapa de promises) + `signal` nos efeitos; um bus de resync debounced para `connect`/`visibilitychange` | A10, A12 | — | M | baixo | uma reconexão = 1 rajada de requests sem duplicatas (Network) |
| 2.11 | Imagens do chat: `decoding="async"`, `width/height`; depois miniatura no servidor | C17, O3 | API para miniatura | M | baixo | memória de imagens no heap/GPU com canal cheio de fotos |

### Fase 3 — Mudanças estruturais

| # | Ação | Ataca | Depende de | Esforço | Risco | Validação |
|---|---|---|---|---|---|---|
| 3.1 | Estado de fala em store próprio (`useSyncExternalStore` por identidade), fora de `participants`; ajustar afk (`afk-context.tsx:381`), palco, sobreposição; OverlayBridge memoiza por nomes | C5, C6 | 2.1 (H2) | G | médio | Profiler em call de 4: commits por fala só nos anéis |
| 3.2 | Separar `SocketContext` (só `socket`, estável) de `PresenceContext`; migrar os 40 consumidores | C8 | — | G | médio (mecânico, muitos arquivos) | evento de presença não re-renderiza quem só usa `socket` |
| 3.3 | Presença por diff (`{userId, presence}`), snapshot só para o socket que conectou; cache em memória das linhas dos online | A2 | 1.8 | G | médio (protocolo muda: cliente novo + servidor compatível com cliente antigo durante a transição) | 1 query por connect só para quem entrou; tamanho dos frames |
| 3.4 | Socket sobrevive à renovação de token (`client.auth = {token}` na próxima reconexão) | A11 | — | M | baixo‑médio | renovar token sem recriar contextos |
| 3.5 | Consolidar AudioContexts (detector na mistura) | O1 | 3.1, H2 | G | médio‑alto (voz robotizada) | threads de áudio; teste com o usuário do driver Cirrus |
| 3.6 | Política central de "modo repouso" (oculto/bandeja/ocioso/bloqueado) num único módulo que os timers assinam, em vez de cada um checar `document.hidden` | §5 | 1.x, 2.x | G | médio | todos os timers listados no §3.3 respondem ao estado |

---

## 7. Sequência recomendada

1. **Medir linha de base completa (§8)** com a versão 1.73.0, incluindo H1/H2 (sobreposição ligada/minimizada; com/sem call). Sem isso não há comparação.
2. Fase 1 inteira (1.1–1.12): independentes, cada uma em commit próprio. Launcher e API em releases separados ([release-process]); 1.8 e 1.9 são compatíveis com clientes antigos.
3. Medir de novo (mesmo roteiro).
4. 2.2 + 2.3 + 2.4 juntos (sobreposição), validados com o roteiro do "clique morto".
5. 2.5 + 2.6 (chat), depois 2.7 (code splitting).
6. 2.8–2.11.
7. Medir. Decidir Fase 3 pelos números: 3.1/3.2 só se o Profiler ainda mostrar cascatas relevantes; 3.3 se o servidor/rede justificar.

---

## 8. Método de medição (antes × depois)

### 8.1 Por processo (sem DevTools, app instalado)

Script PowerShell (salvar como `sample-launcher.ps1`): amostra CPU por processo numa janela de N segundos, memória privada/WS, tipo do processo pela linha de comando e estado das janelas.

```powershell
param([int]$Seconds = 60)
$procs = Get-CimInstance Win32_Process -Filter "Name='Bocas Murchas Launcher.exe'"
$type = @{}
foreach ($x in $procs) {
  $t = 'main'
  if ($x.CommandLine -match '--type=(\S+)') { $t = $matches[1] }
  if ($x.CommandLine -match '--utility-sub-type=(\S+)') { $t = $matches[1] }
  if ($x.CommandLine -match '--renderer-client-id=(\d+)') { $t = "renderer#" + $matches[1] }
  $type[[int]$x.ProcessId] = $t
}
$a = @{}; foreach ($i in $type.Keys) { $a[$i] = (Get-Process -Id $i).CPU }
$t0 = Get-Date; Start-Sleep -Seconds $Seconds; $dt = ((Get-Date) - $t0).TotalSeconds
$rows = foreach ($i in $type.Keys) {
  $g = Get-Process -Id $i
  [pscustomobject]@{ Type = $type[$i]; CPU_pct_1core = [math]::Round(100 * ($g.CPU - $a[$i]) / $dt, 1)
    PrivMB = [math]::Round($g.PrivateMemorySize64 / 1MB, 1); WSMB = [math]::Round($g.WorkingSet64 / 1MB, 1) }
}
$rows | Sort-Object PrivMB -Descending | Format-Table -AutoSize
"TOTAL priv MB = {0:N1}  CPU% 1 core = {1:N1}" -f (($rows | Measure-Object PrivMB -Sum).Sum), (($rows | Measure-Object CPU_pct_1core -Sum).Sum)
```

Para série temporal (uso prolongado): rodar a cada 10 min por 6 h gravando CSV (`| Export-Csv -Append`) e plotar privado por processo.

### 8.2 Cenários (mesma máquina, mesmo usuário, mesma configuração)

| # | Cenário | Como | Registrar |
|---|---|---|---|
| S1 | Boot | abrir, aguardar 2 min sem tocar | script 60 s; tempo até a janela interativa |
| S2 | Navegação | percorrer Social → Jogos → Impressão → LoL → Configurações → Social | script após voltar; heap snapshot |
| S3 | Abrir/fechar repetido | 20× abrir/fechar a mesma página (ex.: Poker, Loja) | heap antes/depois (após GC forçado); detached nodes |
| S4 | Uso prolongado | 6 h com chat aberto num canal movimentado | série do 8.1; 2 heap snapshots |
| S5 | Ocioso em primeiro plano | 10 min sem input | script |
| S6 | Minimizado / bandeja | 10 min | script |
| S7 | Retorno ao 1º plano | restaurar | tempo até atualizar; requests disparadas (Network) |
| S8 | Em jogo | LoL em partida / Minecraft | script + FPS do jogo |
| S9 | Variações para H1/H2 | S6 com sobreposição minimizada; S6 com call / mudo+ensurdecido / clipe off | script |

### 8.3 Dentro do renderer

- Abrir o app instalado com `--remote-debugging-port=9222` (procedimento em [overlay-click-debugging]) e conectar via `chrome://inspect` para heap snapshots, Performance e React Profiler (DevTools do React no build de dev, `npm run dev`).
- `window.__voiceStats()` para faixas da call; `app.getAppMetrics()` no main para CPU/memória por processo com tipo/janela exatos (resolve a atribuição inferida do §2).
- Rede: DevTools → Network (HTTP) e WS → Frames (contar eventos/min e bytes por evento), por 10 min em S5 e S6.
- Servidor: logar contagem de `onlineUserList`/`presencePayload` por connect e duração das rotas de mensagens antes/depois de 1.8/1.10.

### 8.5 Isolar a pintura da janela visível

1. Windows → Acessibilidade → Efeitos visuais → desligar "Efeitos de animação" (vira `prefers-reduced-motion`). Se a GPU cair, são animações cobertas pela regra de reduced-motion; se não cair, são as fora dela (`fx-fire`, `name-flow`, `frame-*`, aurora, `ov-halo`).
2. Com `--remote-debugging-port=9222`: DevTools → Rendering → "Paint flashing" + "Layer borders" mostra o que repinta; Animations panel lista animações ativas; Performance de 5 s mostra "Paint" contínuo e qual nó.
3. Teste A/B rápido no DevTools: `document.documentElement.classList.add('game-running')` e, para as de fora da lista, `document.querySelectorAll('[class*="fx-"],[class*="frame-"]').forEach(e=>e.style.animation='none')`.

### 8.4 Critério de comparação

- Mesma versão de Windows/driver, mesmo número de pessoas na call, mesmo canal, 3 repetições por cenário; reportar mediana.
- Consumo **estável** = privado do renderer principal varia < ruído entre 1 h e 6 h em S4 (definir o ruído pelas 3 repetições de S1).
- Nenhuma ação conta como concluída sem a medição do seu cenário-alvo e sem regressão nos testes existentes (`npm run typecheck`, `npm run test:policy`).

---

## 9. Verificado e deixado (não refazer)

Do relatório de set/2026 (§1 de `performance-audit-2026-09.md`): gate do mic a 100 Hz, clip-recorder em mistura única, WatchStage colapsado com iframe de 1 px, `backgroundThrottling` padrão na janela principal, token LiveKit com `canSubscribe`. Nesta auditoria também OK: rotas desmontam, socket único com reconexão 1–8 s, LiveKit com `adaptiveStream`/`dynacast`, updater só faz polling extra com update pendente, atalhos por evento, keep-alive do LCU destruído ao desconectar.
