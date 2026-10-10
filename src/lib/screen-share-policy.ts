/**
 * Politica de assinatura das faixas da call.
 *
 * A sala conecta com `autoSubscribe: false`: o SFU so encaminha o que este
 * cliente pede explicitamente. Sem isso TODO mundo na call recebia o video de
 * 1080p60 de quem estava compartilhando — e decodificava, alocava buffers e
 * gastava rede — mesmo em outra aba ou no meio de uma partida. O
 * `adaptiveStream` do LiveKit so pausa o video depois que a faixa ja chegou e
 * nao faz nada pelo audio da tela.
 *
 * Este modulo e puro (sem LiveKit, sem React) pra dar pra testar com
 * `node --test` sem montar sala nenhuma. Os valores das fontes sao os mesmos
 * do enum `Track.Source` do livekit-client.
 */

export type TrackSourceName =
  | 'camera'
  | 'microphone'
  | 'screen_share'
  | 'screen_share_audio'
  | 'unknown'

export type TrackKindName = 'audio' | 'video' | 'unknown'

export interface SubscriptionContext {
  /** Este cliente clicou em "Assistir" na tela dessa pessoa. */
  watching: boolean
  /**
   * A janela esta escondida ou minimizada (`document.visibilityState`). Nesse
   * estado nao existe pixel pra pintar: o VIDEO da tela e cortado no servidor
   * e o decodificador liberado. O audio continua — quem minimiza pra jogar
   * ainda quer ouvir o jogo do amigo.
   */
  hidden: boolean
  /**
   * Ensurdecido: nenhum audio e assinado. Volume zero nao bastava — o som
   * continuava chegando e tocando em silencio, e pro Windows isso e "um fluxo
   * de audio esta em uso": o PC nao dorme. Sem assinatura nao chega nada. O
   * anel de quem fala cai no sinal do servidor, que nao depende de receber o
   * audio.
   */
  deafened?: boolean
}

/**
 * Decide se uma publicacao remota deve estar assinada.
 *
 * - Microfone: sempre, menos ensurdecido. E a call.
 * - Camera: sempre. O adaptiveStream pausa quando nao tem card visivel, e a
 *   webcam e 360p — nao e ela que derruba o FPS de ninguem.
 * - Video da tela: SO quando a pessoa esta assistindo E a janela esta visivel.
 * - Audio da tela: SO quando a pessoa esta assistindo (visivel ou nao) e nao
 *   esta ensurdecida.
 * - Fonte desconhecida: audio sim (pode ser um mic publicado sem source),
 *   menos ensurdecido; video nao.
 */
export function shouldSubscribe(
  // `string` e nao os unions: os enums do livekit-client (Track.Source e
  // Track.Kind) sao string enums, que o TS nao aceita como literal.
  publication: { source: TrackSourceName | string; kind: TrackKindName | string },
  context: SubscriptionContext
): boolean {
  switch (publication.source as TrackSourceName) {
    case 'microphone':
      return !context.deafened
    case 'camera':
      return true
    case 'screen_share':
      return context.watching && !context.hidden
    case 'screen_share_audio':
      return context.watching && !context.deafened
    case 'unknown':
    default:
      return publication.kind === 'audio' && !context.deafened
  }
}

/**
 * Presets de qualidade do compartilhamento.
 *
 * O bitrate e o TETO — o encoder desce sozinho quando a rede ou a CPU nao dao
 * conta. Os valores sao pra VP9 (ver `screenPublishPlan`): com 5 Mbps um jogo
 * de movimento pesado ja chegava a 1428×804 a 38 fps no laboratorio; 8 Mbps e
 * o que deixa o 1080p60 perto de 1080p de verdade. O upload de quem transmite
 * raramente e o limite (fibra), e a VPS so repassa.
 */
export const SCREEN_QUALITY = {
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 2_500_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 5_000_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 8_000_000 }
} as const

export type ScreenQuality = keyof typeof SCREEN_QUALITY

/**
 * O que esta sendo transmitido muda como o encoder deve se degradar.
 *
 * - `game`: o que importa e fluidez. `balanced` deixa o WebRTC trocar um
 *   pouco de resolucao por quadros quando a CPU ou a rede apertam.
 * - `text`: IDE, planilha, navegador. Nitidez acima de tudo: segura a
 *   resolucao e sacrifica quadros.
 *
 * O `contentHint` NAO muda com o conteudo: e sempre 'motion' (ver
 * `SCREEN_CONTENT_HINT`).
 */
export type ScreenContent = 'game' | 'text'

export interface EncoderProfile {
  degradationPreference: 'balanced' | 'maintain-resolution'
}

export function encoderProfile(content: ScreenContent): EncoderProfile {
  if (content === 'text') return { degradationPreference: 'maintain-resolution' }
  return { degradationPreference: 'balanced' }
}

/**
 * Sempre 'motion', inclusive pra texto.
 *
 * Com VP9 o Chrome tem um caminho proprio pra "screen content" ('detail' /
 * 'text') que trava em 5 fps com L1T3 — o proprio livekit-client forca
 * 'motion' quando publica tela com codec SVC. Quem troca a faixa depois
 * (lib/screen-capture-gate, ao retomar a captura) precisa usar o mesmo valor,
 * senao a transmissao volta da pausa a 5 fps.
 */
export const SCREEN_CONTENT_HINT = 'motion' as const

/**
 * Como a tela vai pro ar. Medido, nao achado (Electron 33, RTX 3060 +
 * Ryzen 7 5700, LiveKit local, janela de jogo animada a 1080p):
 *
 * - O H.264 do WebRTC no Electron e SOFTWARE (OpenH264) — o Chromium anuncia
 *   NVENC no chrome://gpu mas nao usa no WebRTC, em perfil nenhum. Com o
 *   OpenH264 o escalonador de qualidade do WebRTC derrubava a transmissao pra
 *   714×402 a 15 fps, com banda e CPU sobrando.
 * - Simulcast prendia quem assiste na camada BAIXA: o SFU nunca subia pra
 *   1080p e a camada baixa ainda caia pra 476×268 a 15 fps. Era isso que a
 *   galera via (e nao mudava com VP8 nem com H.264 a 30 fps).
 * - VP9 numa camada so com 3 temporais (L1T3), mesmos 5 Mbps: 1428×804 a
 *   38 fps, e com 12 dos 16 threads da CPU ocupados ainda 1428×804 a 27 fps
 *   — sem mexer no fps do jogo. As camadas temporais deixam o SFU mandar 30
 *   ou 15 fps pra quem tem internet pior, sem simulcast.
 *
 * VP9 e a recomendacao da propria LiveKit quando qualidade importa, e
 * decodifica na GPU de praticamente qualquer placa de quem assiste. Quem nao
 * decodifica VP9 (Safari antigo no site) recebe VP8: o `backupCodec` so e
 * codificado se o SFU pedir.
 */
export const SCREEN_CODEC = 'vp9' as const

export interface ScreenPublishPlan {
  /** Vai pro getDisplayMedia (via setScreenShareEnabled). */
  capture: {
    resolution: { width: number; height: number; frameRate: number }
    contentHint: typeof SCREEN_CONTENT_HINT
  }
  /** TrackPublishOptions do livekit-client. */
  publish: {
    videoCodec: typeof SCREEN_CODEC
    scalabilityMode: 'L1T3'
    simulcast: false
    backupCodec: true
    screenShareEncoding: { maxBitrate: number; maxFramerate: number }
    degradationPreference: EncoderProfile['degradationPreference']
  }
}

export function screenPublishPlan(quality: ScreenQuality, content: ScreenContent): ScreenPublishPlan {
  const preset = SCREEN_QUALITY[quality]
  return {
    capture: {
      resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate },
      contentHint: SCREEN_CONTENT_HINT
    },
    publish: {
      videoCodec: SCREEN_CODEC,
      scalabilityMode: 'L1T3',
      // Explicito: desde o livekit-client 2.22.3 VP9 tambem aceita
      // simulcast, e simulcast e justamente o que prendia a camada baixa.
      simulcast: false,
      backupCodec: true,
      /**
       * `screenShareEncoding`, NAO `videoEncoding`: pra faixa de tela o
       * livekit-client ignora o `videoEncoding` e, sem este campo, vale o
       * padrao do SDK (h1080fps15: 15 fps e 2.5 Mbps fixos).
       */
      screenShareEncoding: { maxBitrate: preset.maxBitrate, maxFramerate: preset.frameRate },
      degradationPreference: encoderProfile(content).degradationPreference
    }
  }
}

/**
 * Com uma tela nova no ar, quem deve ficar em foco?
 *
 * Nunca a propria (quem transmite ja ve no monitor). E foco NAO e assinatura:
 * o palco mostra o card de quem esta em foco com o botao de assistir — o video
 * so vem depois do clique.
 */
export function pickFocus(
  feeds: ReadonlyArray<{ identity: string; isLocal: boolean }>,
  current: string | null
): string | null {
  if (feeds.length === 0) return null
  if (current && feeds.some((feed) => feed.identity === current)) return current
  return (feeds.find((feed) => !feed.isLocal) ?? feeds[0]).identity
}

/**
 * O SFU tem alguem recebendo o VIDEO desta publicacao?
 *
 * Com `dynacast` ligado o servidor manda um `SubscribedQualityUpdate` pra
 * quem transmite toda vez que o conjunto de assinantes muda: cada camada
 * (simulcast) e cada codec vem com `enabled`. Todas desligadas = ninguem
 * assiste — e ai o encoder ja para sozinho (isso e o dynacast), mas a CAPTURA
 * continua rodando a 60 fps por baixo. E este sinal que o transmissor usa pra
 * parar a captura tambem (ver lib/screen-capture-gate).
 *
 * O formato e o da mensagem do protocolo, mas so os campos que importam:
 * `subscribedCodecs` e o formato novo (por codec), `subscribedQualities` o
 * antigo. Servidor manda os dois; qualquer camada ligada em qualquer um vale.
 */
export interface SubscribedQualityLike {
  subscribedQualities?: ReadonlyArray<{ enabled: boolean }>
  subscribedCodecs?: ReadonlyArray<{ qualities: ReadonlyArray<{ enabled: boolean }> }>
}

export function hasViewers(update: SubscribedQualityLike): boolean {
  if (update.subscribedCodecs?.some((codec) => codec.qualities.some((q) => q.enabled))) {
    return true
  }
  return update.subscribedQualities?.some((q) => q.enabled) ?? false
}

/**
 * Quanto tempo esperar sem espectador antes de parar a captura.
 *
 * Nao e zero porque o sinal chega assim que a pessoa troca de aba ou minimiza
 * (o cliente dela solta o video), e ela costuma voltar em segundos — parar e
 * readquirir a captura custa um keyframe e um flash preto pra quem assiste.
 */
export const CAPTURE_IDLE_GRACE_MS = 4_000
