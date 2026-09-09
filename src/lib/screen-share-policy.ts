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
}

/**
 * Decide se uma publicacao remota deve estar assinada.
 *
 * - Microfone: sempre. E a call.
 * - Camera: sempre. O adaptiveStream pausa quando nao tem card visivel, e a
 *   webcam e 360p — nao e ela que derruba o FPS de ninguem.
 * - Video da tela: SO quando a pessoa esta assistindo E a janela esta visivel.
 * - Audio da tela: SO quando a pessoa esta assistindo (visivel ou nao).
 * - Fonte desconhecida: audio sim (pode ser um mic publicado sem source),
 *   video nao.
 */
export function shouldSubscribe(
  // `string` e nao os unions: os enums do livekit-client (Track.Source e
  // Track.Kind) sao string enums, que o TS nao aceita como literal.
  publication: { source: TrackSourceName | string; kind: TrackKindName | string },
  context: SubscriptionContext
): boolean {
  switch (publication.source as TrackSourceName) {
    case 'microphone':
      return true
    case 'camera':
      return true
    case 'screen_share':
      return context.watching && !context.hidden
    case 'screen_share_audio':
      return context.watching
    case 'unknown':
    default:
      return publication.kind === 'audio'
  }
}

/**
 * Presets de qualidade do compartilhamento.
 *
 * Pensados pra SFU self-hosted: o upload da VPS e o gargalo. O bitrate e o
 * TETO — o encoder desce sozinho quando a rede ou a CPU nao dao conta.
 */
export const SCREEN_QUALITY = {
  '720p30': { width: 1280, height: 720, frameRate: 30, maxBitrate: 1_800_000 },
  '1080p30': { width: 1920, height: 1080, frameRate: 30, maxBitrate: 3_000_000 },
  '1080p60': { width: 1920, height: 1080, frameRate: 60, maxBitrate: 5_000_000 }
} as const

export type ScreenQuality = keyof typeof SCREEN_QUALITY

/**
 * O que esta sendo transmitido muda como o encoder deve se degradar.
 *
 * - `game`: o que importa e fluidez. `contentHint: 'motion'` faz o Chromium
 *   tratar a captura como camera (encoder em modo de tempo real, sem o modo
 *   "screen content" que congela quadros pra manter nitidez) e
 *   `degradationPreference: 'balanced'` deixa ele baixar RESOLUCAO quando a
 *   CPU aperta — que e exatamente o que acontece com um jogo aberto. Com
 *   'maintain-resolution' o encoder segurava 1080p a qualquer custo e
 *   sacrificava os quadros, entao a transmissao travava E o jogo tambem.
 * - `text`: IDE, planilha, navegador. Nitidez acima de tudo.
 */
export type ScreenContent = 'game' | 'text'

export interface EncoderProfile {
  contentHint: 'motion' | 'detail'
  degradationPreference: 'balanced' | 'maintain-resolution'
}

export function encoderProfile(content: ScreenContent): EncoderProfile {
  if (content === 'text') {
    return { contentHint: 'detail', degradationPreference: 'maintain-resolution' }
  }
  return { contentHint: 'motion', degradationPreference: 'balanced' }
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
