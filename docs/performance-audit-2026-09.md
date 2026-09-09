# Auditoria de desempenho: o launcher em cima de um jogo

Data: 2026-09-08. Launcher v1.3.1 + commits desta sessão (não lançados).
Complementa `docs/screen-share-performance.md` (mesma data, mais cedo), que
resolveu o lado de QUEM ASSISTE: `autoSubscribe: false`, H.264, uma tela por
vez, minimizado corta o vídeo. Esta auditoria varreu o resto: o lado de quem
transmite, o processo main, os timers do renderer e o servidor.

## 1. Diagnóstico

Tudo abaixo foi confirmado lendo o código (e o SDK em `node_modules`), não é
hipótese. Ordem de impacto sobre um jogo rodando na mesma máquina.

| # | Onde | Causa raiz | Impacto | Estado |
|---|------|-----------|---------|--------|
| 1 | **Transmissor sem espectador** — `voice-context.tsx` + livekit-client | `dynacast` desligava o **encoder** quando ninguém assinava, mas o `getDisplayMedia` continuava: WGC entregando 1080p60 pro renderer, cópia de textura e memória de quadro pra um encoder que jogava fora. | GPU + barramento + ~1 núcleo de trabalho de captura durante toda a transmissão, mesmo com zero espectador (o caso comum: a pessoa compartilha "pra quem quiser" e joga). | ✅ corrigido (§2.1) |
| 2 | **Main** — `lol.ts` / `lol-discovery.ts` | Descoberta do cliente do LoL a cada 5 s, o dia inteiro, com `tasklist` (processo novo) por ciclo e PowerShell quando o cliente está aberto. `loadSettings()` (leitura + parse + normalize do JSON) por ciclo. | ~17 mil processos/dia; picos de CPU do main a cada 5 s durante o Minecraft. | ✅ corrigido (§2.2) |
| 3 | **Main** — `updater.ts` | `autoDownload: true` e só a INSTALAÇÃO era adiada por `isBusy()`. A checagem de 30 min podia iniciar download de dezenas de MB a toda velocidade no meio da partida. | Ping subindo + disco ocupado durante o jogo, aleatório. | ✅ corrigido (§2.2) |
| 4 | **Renderer** — sete `setInterval` de 1 s independentes (enquete, aposta, drop, leaderboard, atividade, countdown do login) | Cada card acordava o thread principal fora de fase e fazia o próprio render; continuavam com o launcher minimizado atrás do jogo. | Dezenas de despertares/s com o canal cheio; render à toa em janela escondida. | ✅ corrigido (§2.3) |
| 5 | **Renderer** — `voice-context.tsx` | `getStats()` do WebRTC a cada 3 s (varredura de todos os relatórios) mesmo com a janela escondida, só pra escrever um número na barra. | CPU + GC contínuos na call. | ✅ 5 s, só visível |
| 6 | **API** — `realtime/activity.ts` | Placar ao vivo comparado inteiro: ouro e CS mudam a cada poll de 5 s → `io.emit` pra **todo mundo** a cada 5 s por pessoa em partida, a partida inteira. | Cada cliente (inclusive quem joga outra coisa) acordava socket + React + lista de membros a cada 5 s. | ✅ corrigido (§2.4) |
| 7 | **Main** — `launcher.ts` | `console.log` de cada linha de stdout/stderr do Minecraft (Forge cospe milhares) — escrita síncrona num pipe morto no app empacotado. | CPU do main durante o jogo. | ✅ só em dev |
| 8 | **Renderer** — animações CSS infinitas (pulsos, brilhos, scanlines) em chrome sempre montado | Compositor acordando 60×/s pra piscar bolinhas, inclusive com o launcher no segundo monitor durante o jogo. | GPU (pequeno, mas constante). | ✅ `html.game-running` (§2.3) |
| 9 | **Renderer** — `chat-context.tsx` | Cache por canal só crescia (50 por rolagem, nunca descartado), e o chat não é virtualizado: DOM inteiro ao reabrir o canal. | RAM + tempo de render ao trocar de canal, cresce a noite toda. | ✅ apara a 100 por canal fechado |
| 10 | **Main** — `settings.ts` | Leitura + normalize do arquivo em todo timer e todo `settings:get`; escrita não atômica. | Disco/alocação a troco de nada; risco de JSON truncado numa queda. | ✅ cache por mtime + tmp/rename |

### Verificado e deixado como está (com motivo)

- **Gate do microfone a 100 Hz no thread principal** (`audio-processor.ts`): custo real ~1 % de um núcleo (duas leituras de 1024 amostras). Um AudioWorklet seria o "certo", mas a CSP bloqueia `blob:` e o autor documentou a decisão; o lookahead de 12 ms depende do tick de 10 ms. Chromium não estrangula timers de página com RTCPeerConnection aberta, então na bandeja continua funcionando (há guarda pra abrir o gate se estrangular).
- **Gravador de clipes** (`clip-recorder.ts`): a auditoria automática apontou "3 gravadores por participante"; na verdade são 3 gravadores Opus 64 kbps sobre UMA mistura, custo desprezível. É o que permite clipar o passado. Fica.
- **WatchStage colapsado** mantém o iframe do YouTube em 1 px: decisão de produto (o áudio continua quando uma tela entra em foco). O player adapta a qualidade ao tamanho (144p). Fica.
- **`backgroundThrottling`** do BrowserWindow no padrão (ligado): é isso que faz o Chromium estrangular timers/rAF do renderer quando a janela vai pra bandeja — exatamente o que se quer durante o jogo. Voz e mídia não são afetadas. Não desligar.
- **GIFs no chat** já têm `loading="lazy"`; Chromium pausa animação de imagem fora do viewport.
- **Presença no servidor** manda o retrato completo em cada entrada/saída: grupo pequeno, evento raro, formato consumido por três contextos do cliente. Não vale a reestruturação agora.
- **Token do LiveKit** com `canSubscribe: true` pra todos: o controle é no cliente (`autoSubscribe: false` + política); o SFU só encaminha o que é pedido. Não precisa de token por papel.

## 2. O que foi feito

### 2.1 Captura da tela para sem espectador (`src/lib/screen-capture-gate.ts`)

```
publica tela ─► SFU manda SubscribedQualityUpdate (dynacast)
                  todas as camadas enabled:false = ninguém assina
                  │
                  ├─ 4 s de carência (voltou alguém? cancela)
                  ▼
                replaceTrack(canvas.captureStream(0), false)
                  → SDK PARA a faixa do getDisplayMedia (WGC desliga)
                  → publicação continua no ar (card "X está transmitindo")
                  → estado 'idle' no ScreenStage do transmissor
                  │
    alguém clica "Assistir" ─► SFU manda enabled:true
                  ▼
                selectSource(mesma fonte, só vídeo) + getDisplayMedia
                  (o main entrega a fonte marcada, sem seletor)
                → replaceTrack(faixa nova, false) → 'live'
```

- Sinal: `room.engine` (`subscribedQualityUpdate`), decidido pela função pura
  `hasViewers()` em `screen-share-policy.ts`. Se o SDK não expuser `engine`
  ou o servidor não mandar o sinal, **nada muda** (captura fica ligada como
  antes) — falha pro lado seguro.
- Só o VÍDEO para. O sinal do SFU não cobre áudio, e o áudio da tela continua
  pra quem minimizou o launcher pra jogar ouvindo o amigo (política anterior).
  Loopback WASAPI é barato.
- A fonte sumiu enquanto estava parada (janela fechada): `onLost` → a
  transmissão é encerrada, como o SDK faria se a faixa morresse ao vivo.
- **Chave de segurança:** `screenShare.idleWhenUnwatched` (padrão ligado),
  checkbox "Pausar a captura quando ninguém estiver assistindo" no seletor de
  tela. Desligar volta ao comportamento anterior.
- Console do transmissor: `[screen] captura pausada: ninguem assistindo` /
  `[screen] captura retomada`.

### 2.2 Processo main

- `lol-discovery.ts`: lockfiles das pastas conhecidas ANTES do `tasklist`
  (leitura de arquivo em vez de processo). `lol.ts`: depois de 12 ciclos sem
  cliente (1 min), o intervalo vai de 5 s pra 30 s; volta a 5 s ao ligar o
  watcher ou quando o cliente fecha (pode ser só um restart).
- `settings.ts`: `loadSettings()` faz `stat` e só relê quando mtime/size
  mudam; `updateSettings()` grava em `.tmp` + `rename`.
- `updater.ts`: checagem AUTOMÁTICA adiada quando `isBusy()` (call, Minecraft
  rodando, LoL fora do lobby). A manual (botão) continua.
- `launcher.ts`: stdout/stderr do Minecraft só ecoam no console em dev; o anel
  de linhas pra diagnóstico continua.

### 2.3 Renderer

- `lib/use-now.ts`: um relógio por intervalo (`subscribeTicker`, `useTicker`,
  `useNow`). Para em `document.hidden`, dispara na hora ao voltar. Substituiu
  os timers locais de `PollCard`, `WagerCard`, `DropHost`, `BetPopover`,
  `LeaderboardPanel`, `ActivityLine`, `MicrosoftDeviceCodeModal`.
- `voice-context.tsx`: ping a cada 5 s, pulado com janela escondida
  (relê no `visibilitychange`).
- `gamification-context.tsx` (partidas ao vivo, 30 s) e
  `interaction-guard.ts` (watchdog, 800 ms): pulam com janela escondida.
- `activity-context.tsx` liga `<html class="game-running">` com processo do
  Minecraft vivo ou partida de LoL (sinais crus, não o que a pessoa
  compartilha). `globals.css` desliga as animações infinitas sob essa classe.
- `chat-context.tsx`: ao trocar de canal, os fechados ficam com as últimas
  100 mensagens; rolar pra cima busca de novo.

### 2.4 API

- `realtime/activity.ts`: abate/morte/assistência/nível saem na hora; ouro e
  CS no máximo a cada 30 s por pessoa. Mapa `lastBroadcastAt` limpo com a
  atividade.

## 3. Como medir (antes → depois)

Não foi possível rodar jogo + dois clientes + SFU nesta sessão. Os números
abaixo são o que a mudança garante por construção ou o que o Chromium
documenta; o roteiro fecha a conta na primeira call de teste.

### Transmissor (o requisito principal)

1. Entrar na call com dois clientes (A transmite, B não clica em "Assistir").
2. Em A, DevTools: esperar ~10 s (dynacast + 4 s de carência). Deve aparecer
   `[screen] captura pausada: ninguem assistindo`. O card no palco de A
   mostra "ninguém assistindo · captura pausada".
3. Gerenciador de Tarefas → Detalhes → `Bocas Murchas.exe` (renderer) e o
   processo de GPU: uso deve cair pro mesmo patamar de "na call sem
   transmitir". Antes: ~5–10 % de um núcleo + GPU de cópia a 60 fps.
4. Em B, clicar "Assistir": em A aparece `[screen] captura retomada`; B vê o
   vídeo em <1 s (getDisplayMedia + keyframe). `await __voiceStats()` em A
   volta a mostrar `outbound video` com fps > 0.
5. B fecha o painel: 4 s depois A pausa de novo.
6. Critério objetivo: **com zero espectador, `__voiceStats()` em A não pode
   mostrar fps > 0 em `outbound video`, e o processo de GPU não pode ter
   consumo de captura.**

### Espectador (já garantido pela sessão anterior, reconferir)

- No cliente que não clicou em "Assistir", `__voiceStats()` não lista nenhuma
  linha `inbound video`.

### Main

- Sem cliente do LoL aberto, `Get-Process tasklist` (ou o Monitor de
  Recursos) deve mostrar um `tasklist.exe` a cada ~30 s, não a cada 5 s, um
  minuto depois de abrir o launcher.

### Renderer escondido

- Minimizar o launcher e, no DevTools (Performance → gravar 10 s): zero
  chamadas de `setNow`/`refreshLiveGames`/`read` (ping) enquanto escondido.

## 4. Riscos

- **Gate depende do sinal do SFU.** Se o LiveKit self-hosted não mandar
  `SubscribedQualityUpdate` no publish sem assinante, a captura não pausa
  (comportamento antigo, sem quebra). Se mandar "desligado" com espectador
  (não deveria), o espectador vê preto até o próximo evento de assinatura.
  Por isso a chave `idleWhenUnwatched` fica visível no seletor.
- **Flash preto de ~300 ms** pra quem clica em "Assistir" numa transmissão
  pausada (readquirir a fonte). Aceito: é a troca por GPU livre pro jogo.
- **Descoberta do LoL até 30 s mais lenta** depois de 1 min sem cliente.
  Entre abrir o cliente e entrar numa fila passa mais que isso.
- **Cache do chat aparado**: quem tinha rolado muito pra cima num canal e
  volta pra ele vê só as últimas 100; rolar pra cima busca de novo.
- **Placar**: ouro/CS ficam até 30 s atrasados na lista dos outros.

## 5. Arquivos

Launcher (commits `ed761dd`, `82cdc3b`, `e079180`, `ce5af6c`):

- novo `src/lib/screen-capture-gate.ts` (+ `.test.ts`), `src/lib/screen-share-policy.ts` (`hasViewers`, `CAPTURE_IDLE_GRACE_MS`), `src/lib/voice-context.tsx`, `src/components/social/ScreenStage.tsx`, `src/components/social/ScreenSharePicker.tsx`, `electron/preload/types.ts`, `electron/main/services/settings.ts`
- `src/lib/use-now.ts` (reescrito), `src/components/cards/{PollCard,WagerCard}.tsx`, `src/components/social/{ActivityLine,LeaderboardPanel,BetPopover,DropHost}.tsx`, `src/components/MicrosoftDeviceCodeModal.tsx`, `src/lib/{gamification-context,interaction-guard,activity-context,chat-context}.tsx`, `src/styles/globals.css`
- `electron/main/services/{lol,lol-discovery,updater,launcher}.ts`
- `package.json` (`test:policy` inclui o gate), `tsconfig.web.json` (`allowImportingTsExtensions`)

API (commit `6257ab3`): `src/realtime/activity.ts`.

## 6. Testes rodados

- Launcher: `npm run test:policy` — 14/14; `npm run typecheck` — ok;
  `electron-vite build` — ok.
- API: `npm test` (vitest) — 121/121; `tsc --noEmit` — ok.
- Manual (duas máquinas + jogo): pendente, roteiro em §3.

Sem bump de versão nem entrada no changelog: release é decisão do dono do
repo (bump + `src/lib/changelog.ts`).
