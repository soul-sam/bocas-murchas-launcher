# Compartilhamento de tela: por que travava o jogo e o que mudou

Data: 2026-09-08. Launcher v1.3.1 (livekit-client 2.22.0, Electron 33 / Chromium 130).

## 1. Diagnóstico

Cinco causas, em ordem de impacto. Todas confirmadas lendo o código e o SDK
instalado em `node_modules/livekit-client` — não são hipóteses.

| # | Onde | Causa raiz | Efeito |
|---|------|-----------|--------|
| 1 | Espectador (todo mundo) | `Room` conectava com `autoSubscribe: true` (padrão do LiveKit). No instante em que alguém publicava a tela, o SFU mandava vídeo **e** áudio da tela pra **todos** os participantes. O `adaptiveStream` só pausa o vídeo depois que a faixa já chegou e o decodificador já existe, e não faz nada pelo áudio. | Cada cliente na call decodificava até 1080p60 / 5 Mbps, em software (VP8), enquanto jogava — sem nunca ter aberto o palco. |
| 2 | Espectador com palco aberto | `ScreenStage` montava um `<video>` pra **cada** tela no ar (a em foco e as miniaturas). | N transmissões = N decodificadores + N superfícies compostas na GPU. |
| 3 | Quem transmite | Codec padrão VP8 (software no Windows), `degradationPreference: 'maintain-resolution'` (encoder segura 1080p e derruba quadros, custo de CPU não cai) e `contentHint` padrão de screen content. | Encoder disputava núcleos com o jogo; sob pressão a transmissão travava **e** o jogo também. |
| 4 | Quem transmite | Prévia da própria captura sempre pintada no launcher em resolução cheia. | Mais um consumidor de GPU em cima do jogo, sem valor: a pessoa já está olhando o monitor. |
| 5 | Quem transmite | Capturador padrão do WebRTC no Windows (cópia de framebuffer via CPU). Nenhum switch de GPU no Electron. | ~370 MB/s de memcpy a 1080p60. |

Secundários (também corrigidos):

- `syncParticipants` recriava a lista de participantes a cada `ActiveSpeakersChanged` / tick do detector de fala (60 ms), re-renderizando o palco inteiro em cima de um vídeo 60 fps mesmo sem mudança.
- `participant.setVolume(v)` do LiveKit só afeta o **microfone**. O slider de volume e o "ensurdecer" nunca valiam pro áudio da tela de quem transmite (bug latente, ficou visível agora que o áudio da tela só chega pra quem assiste).
- `pingMs` e `connectionQuality` não estavam nas deps do `useMemo` do contexto: só atualizavam de carona em outro evento.

O que **não** era problema: o servidor. A API só emite token (`livekit.routes.ts`) e estado (`screenshare:state` via socket). A mídia é SFU puro no LiveKit self-hosted — quem transmite já envia um fluxo só, o servidor replica. Nada de relay na API.

## 2. Fluxo (antes → depois)

```
TRANSMISSOR
  ScreenSharePicker → screen.selectSource (IPC) → setDisplayMediaRequestHandler (main)
  → getDisplayMedia (WGC agora, GDI antes) → LocalVideoTrack
  → setScreenShareEnabled({ contentHint }, { videoCodec: 'h264', degradationPreference, simulcast })
  → SFU (1 fluxo, 2 camadas: original + ~360p3fps)

ESPECTADOR (antes)
  connect(autoSubscribe: true) → TrackSubscribed(video+audio da tela) pra todos
  → setScreenShares → ScreenStage monta <video> em foco + <video> por miniatura

ESPECTADOR (depois)
  connect(autoSubscribe: false)
  → TrackPublished → shouldSubscribe(): mic/câmera = sim; tela = NÃO
  → feed { track: null, watching: false } → ScreenStage mostra card "X está transmitindo"
  → clique em "Assistir" → watchScreen(id) → setSubscribed(true) no vídeo e no áudio da tela
  → TrackSubscribed → feed.track → <video> (um só; miniaturas nunca têm vídeo)
  → "Parar de ver" / trocar de aba / trocar foco / minimizar / sair → setSubscribed(false)
    (minimizar corta só o vídeo; o áudio da tela continua pra quem alt-tab pra jogar)
```

Política em `src/lib/screen-share-policy.ts` (pura, testada).

## 3. Métricas

### Como medir

Em qualquer cliente na call, no DevTools:

```js
await __voiceStats()
```

Sai uma tabela por faixa RTP: `codec`, resolução, `fps`, `kbps` (instantâneo,
janela de 1 s), `lost`, `jitterMs`, `impl` (decoder/encoder), `powerEfficient`
(GPU confirmado pelo Chromium) e `limitation` (`cpu` / `bandwidth` / `none`).
CPU/GPU/RAM do processo: Gerenciador de Tarefas → aba Detalhes → processos
`Bocas Murchas.exe` (o renderer é o de maior memória; o GPU process é separado).
FPS do jogo: overlay do próprio jogo / Xbox Game Bar.

### Esperado por construção (antes → depois)

Não foi possível rodar dois clientes + um jogo nesta sessão (ver limitações),
então a tabela abaixo é o que a mudança **garante estruturalmente** ou o que o
Chromium documenta; os números com "~" são estimativas a confirmar com o
comando acima.

| Métrica | Cliente que NÃO assiste (antes) | Depois | Como conferir |
|---|---|---|---|
| Fluxo de tela recebido | vídeo + áudio, ~1.8–5 Mbps | **0** (nenhuma linha `inbound video` no `__voiceStats`) | `__voiceStats()` |
| Decodificador de vídeo vivo | 1 por tela no ar | **0** | idem (`impl` vazio) |
| `<video>` montados | 1 + miniaturas | **0** | Elements no DevTools |
| CPU renderer | ~8–20 % (VP8 1080p sw) | ~0 % extra | Gerenciador de Tarefas |
| RAM (buffers de decode) | +60–150 MB | 0 extra | idem |

| Métrica | Quem transmite (antes) | Depois | Como conferir |
|---|---|---|---|
| Codec | VP8, `impl: libvpx` | H264, `impl: MediaFoundationVideoEncodeAccelerator`, `powerEfficient: true` | `__voiceStats()` |
| CPU do encoder 1080p60 | ~1 núcleo inteiro | ~5–10 % de um núcleo (GPU faz o trabalho) | Gerenciador |
| Captura | GDI (CPU) | WGC (GPU), zero-hz quando parado | não há métrica direta; `limitation` deixa de ser `cpu` |
| Sob pressão de CPU | segura 1080p, derruba fps (`limitation: cpu`) | baixa resolução, mantém fps (`game`) | `__voiceStats()` |
| Prévia própria | sempre pintada | só no "Ver prévia" | visual |

| Métrica | Quem assiste | Antes | Depois |
|---|---|---|---|
| Decoder | VP8 software | H264 `ExternalDecoder` (D3D11) | `powerEfficient: true` |
| Janela minimizada | vídeo pausado pelo adaptiveStream (assinatura e decoder vivos) | assinatura de vídeo desfeita, decoder liberado; áudio continua | `__voiceStats()` com janela escondida |

Latência e perda de pacotes: não mudam por construção (mesma rede, mesmo SFU),
mas o `qualityLimitationReason: cpu` some — era ele que virava frame drop e
"lag" percebido.

## 4. Plano (impacto × esforço) e o que foi feito

| Prioridade | Item | Impacto | Esforço | Estado |
|---|---|---|---|---|
| 1 | `autoSubscribe: false` + assinatura sob demanda ("Assistir") | Elimina 100 % do custo de quem não assiste | Médio | ✅ |
| 2 | H.264 (encode/decode na GPU) | Corta CPU do transmissor e de cada espectador | Baixo | ✅ |
| 3 | Miniaturas sem vídeo; uma tela assistida por vez | N decoders → 1 | Baixo | ✅ |
| 4 | Perfil `game`/`text` (contentHint + degradationPreference) | Encoder deixa de travar o jogo sob CPU | Baixo | ✅ |
| 5 | Minimizado/oculto corta o vídeo no servidor | Rede + decoder a zero em segundo plano | Baixo | ✅ |
| 6 | Captura WGC + zero-hz (Electron switches) | Menos CPU na captura | Baixo | ✅ |
| 7 | Prévia própria opcional | GPU do transmissor | Baixo | ✅ |
| 8 | `syncParticipants` sem render redundante; `React.memo` no palco | Menos re-render em cima do vídeo | Baixo | ✅ |
| 9 | Volume/ensurdecer valendo pro áudio da tela | Correção | Baixo | ✅ |
| — | Trocar simulcast por SVC (VP9/AV1) | Marginal; AV1 HW só em GPU nova | Alto | Não feito (H264 + 2 camadas cobre) |
| — | Preset dinâmico de bitrate por RTT | Marginal; o encoder já degrada sozinho | Médio | Não feito |

## 5. Arquivos

- `src/lib/screen-share-policy.ts` — **novo**. Política pura: `shouldSubscribe`, `encoderProfile`, `pickFocus`, presets.
- `src/lib/screen-share-policy.test.ts` — **novo**. `npm run test:policy` (node --test, sem dependência).
- `src/lib/voice-diagnostics.ts` — **novo**. `window.__voiceStats()`.
- `src/lib/voice-context.tsx` — `autoSubscribe: false`; handlers `TrackPublished`/`TrackUnpublished`; feeds a partir da publicação; `watchScreen`/`unwatchScreen`; `visibilitychange`; H.264 + perfil; volume pro áudio da tela; `sameParticipants`.
- `src/components/social/ScreenStage.tsx` — card "Assistir", miniaturas sem vídeo, prévia própria opcional, `unwatch` no unmount/troca de foco, `srcObject = null` no detach.
- `src/components/social/ScreenSharePicker.tsx` — seletor "Conteúdo: Jogo / Texto".
- `electron/preload/types.ts`, `electron/main/services/settings.ts` — `screenShare.content` (padrão `game`, sem bump de `SETTINGS_REVISION`: campo novo com default no `normalize`).
- `electron/main/index.ts` — switches WGC/zero-hz no Windows.
- `package.json` (script `test:policy`), `tsconfig.web.json` (exclui `*.test.ts`).

## 6. Testes

- `npm run test:policy` — 7/7 passando (política de assinatura, perfil do encoder, foco).
- `npm run typecheck` — passa (lint de design tokens + tsc node + tsc web).
- Manual, pendente (precisa de duas máquinas): roteiro em §3. O critério de
  aceite do requisito principal é objetivo: **no cliente que não clicou em
  "Assistir", `__voiceStats()` não pode listar nenhuma linha `inbound video`.**

## 7. Limitações e riscos

- **Sem medição real nesta sessão.** Não dá pra reproduzir "jogo + dois clientes
  + SFU" aqui. Os números da §3 são estruturais/estimados; o comando
  `__voiceStats()` existe pra fechar essa conta na primeira call de teste.
- **H.264 depende do servidor.** O LiveKit self-hosted habilita H.264 por
  padrão; se o `livekit.yaml` da VPS restringir `enabled_codecs`, o
  livekit-client cai sozinho pro primeiro codec permitido (loga um aviso) —
  não quebra, só perde a GPU. Conferir com `__voiceStats()` → `codec`.
- **Simulcast H.264 no Chromium** funciona, mas alguns drivers antigos
  (Intel pré-Gen9) não expõem encoder MF; o Chromium volta pro OpenH264 em
  software — ainda mais leve que VP8 no decode dos outros, mas sem o ganho no
  transmissor.
- **WGC** exige Windows 10 1903+. Em versões anteriores o Chromium ignora as
  flags. Janelas capturadas por WGC ganham uma borda amarela fina no Windows
  10 (o Windows 11 não desenha).
- **Uma tela por vez.** Assistir duas ao mesmo tempo não é mais possível —
  decisão deliberada; o custo de N decoders era um dos problemas.
- **Áudio da tela em segundo plano continua** (por design: alt-tab pra jogar
  ouvindo o amigo). Quem quiser silêncio total usa "Parar de ver".
- **Sem entrada no changelog / bump de versão.** Release é decisão do dono do
  repo (ver processo em memória: bump + entrada em `src/lib/changelog.ts`).
