/**
 * YouTube sem SDK.
 *
 * O CSP do launcher só deixa script do próprio app rodar (script-src 'self'),
 * então o `iframe_api` oficial do YouTube está fora. Não faz falta: o player
 * embutido fala o mesmo protocolo de postMessage que o SDK usa por baixo, e
 * aqui estão só as partes dele que o "assistir junto" precisa — montar a URL
 * do embed, mandar comando e reconhecer o que volta.
 *
 * Domínio `youtube-nocookie.com` em vez de `youtube.com`: mesmo player, sem
 * gravar cookie de rastreamento na máquina de todo mundo pra ver um vídeo.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** De onde o player fala com a gente — todo `message` de outra origem é ignorado. */
export const YT_EMBED_ORIGIN = 'https://www.youtube-nocookie.com'

/** Estados do player, iguais aos de `YT.PlayerState` do SDK. */
export const YT_STATE = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5
} as const

export type YtPlayerState = (typeof YT_STATE)[keyof typeof YT_STATE]

/**
 * Aceita tudo que alguém cola no chat: watch?v=, youtu.be/, shorts/, embed/,
 * live/, com ou sem https, com ou sem `www.`/`m.`/`music.`, e o id pelado
 * (11 caracteres). Devolve null pra qualquer outra coisa — a decisão de
 * "isso é um vídeo?" fica num lugar só.
 */
export function parseYouTubeUrl(input: string): { videoId: string } | null {
  const raw = input.trim()
  if (!raw) return null
  if (VIDEO_ID.test(raw)) return { videoId: raw }

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [first, second] = url.pathname.split('/').filter(Boolean)
    if (first === 'watch') id = url.searchParams.get('v')
    else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') id = second ?? null
  }

  return id && VIDEO_ID.test(id) ? { videoId: id } : null
}

/**
 * Título via oEmbed — a única API pública do YouTube que não pede chave.
 * Melhor esforço: sem rede, sem CORS ou vídeo privado devolve null e o
 * cartão fica com "vídeo do YouTube". Ninguém espera 4s pra dar play.
 */
export async function fetchYouTubeTitle(videoId: string, timeoutMs = 4_000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const watchUrl = encodeURIComponent(youtubeWatchUrl(videoId))
    const res = await fetch(`https://www.youtube.com/oembed?url=${watchUrl}&format=json`, {
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = (await res.json()) as { title?: unknown }
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/** hqdefault existe pra todo vídeo; maxresdefault só pros que subiram em HD. */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

/**
 * URL do player embutido, pronta pra ser controlada por postMessage.
 *
 * `origin` só entra quando o app roda em http(s) (dev, pelo Vite). Em
 * produção o renderer é carregado por file:// e `window.location.origin` vira
 * "file://" — uma origem opaca. O player usa esse valor como targetOrigin ao
 * responder, e postMessage pra origem opaca é descartado em silêncio: o vídeo
 * tocava, mas nunca chegava tempo nem estado, e a sincronia ficava cega. Sem
 * o parâmetro o player responde pra `*`, que é o que o SDK oficial também faz
 * fora de http.
 *
 * `controls=0`: os controles são nossos, pra toda ação local virar evento pro
 * servidor. `disablekb=1` pelo mesmo motivo — espaço/setas dentro do iframe
 * mudariam o player só de quem apertou.
 */
export function youtubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    autoplay: '1',
    playsinline: '1',
    rel: '0',
    controls: '0',
    disablekb: '1',
    modestbranding: '1',
    iv_load_policy: '3'
  })
  if (/^https?:$/.test(window.location.protocol)) params.set('origin', window.location.origin)
  return `${YT_EMBED_ORIGIN}/embed/${videoId}?${params.toString()}`
}

export type YtCommand =
  | 'playVideo'
  | 'pauseVideo'
  | 'seekTo'
  | 'mute'
  | 'unMute'
  | 'setVolume'
  | 'getCurrentTime'

/**
 * Manda um comando pro player. `id` é o que o player devolve em cada mensagem
 * — serve pra dois embeds na mesma página não se confundirem.
 */
export function sendPlayerCommand(
  iframe: HTMLIFrameElement | null,
  id: string,
  func: YtCommand,
  args: unknown[] = []
): void {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: 'command', func, args, id, channel: 'widget' }),
    YT_EMBED_ORIGIN
  )
}

/**
 * O player só começa a mandar `infoDelivery` (tempo, estado) depois de ouvir
 * isso. Sem o aperto de mão a gente controla às cegas.
 */
export function sendPlayerListening(iframe: HTMLIFrameElement | null, id: string): void {
  iframe?.contentWindow?.postMessage(
    JSON.stringify({ event: 'listening', id, channel: 'widget' }),
    YT_EMBED_ORIGIN
  )
}

export interface YtInfo {
  currentTime?: number
  duration?: number
  playerState?: YtPlayerState
  volume?: number
  muted?: boolean
  videoData?: { title?: string; video_id?: string }
}

export type YtMessage =
  | { event: 'onReady'; id?: string }
  | { event: 'infoDelivery'; id?: string; info: YtInfo }
  | { event: 'onStateChange'; id?: string; info: YtPlayerState }
  | { event: 'onError'; id?: string; info: number }
  | { event: 'initialDelivery'; id?: string; info: YtInfo }
  | { event: string; id?: string; info?: unknown }

/**
 * Lê uma mensagem vinda do iframe. Devolve null pra qualquer coisa que não
 * seja do player (outras origens, JSON quebrado, id de outro embed).
 */
export function parsePlayerMessage(event: MessageEvent, expectedId: string): YtMessage | null {
  if (event.origin !== YT_EMBED_ORIGIN) return null
  if (typeof event.data !== 'string') return null

  let data: unknown
  try {
    data = JSON.parse(event.data)
  } catch {
    return null
  }

  if (!data || typeof data !== 'object') return null
  const message = data as YtMessage
  if (typeof message.event !== 'string') return null
  // O player ecoa o id que mandamos no `listening`; mensagem sem id é do
  // aperto de mão inicial e também interessa.
  if (message.id !== undefined && String(message.id) !== expectedId) return null
  return message
}

/**
 * O que mostrar na tela pra cada erro do player.
 *
 * Texto por código porque um "não deu pra tocar" genérico manda a pessoa ficar
 * tentando de novo — e cada um desses pede uma atitude diferente: trocar de
 * vídeo, abrir no YouTube, ou atualizar o launcher.
 *
 * O 153 é o mais traiçoeiro, e foi ele que deixou o assistir junto quebrado no
 * app instalado: significa "requisição sem Referer válido". O player CARREGA,
 * responde o aperto de mão (`onReady` chega) e só depois manda 153 — sem nunca
 * mandar `infoDelivery`, que é de onde saem tempo e estado. Resultado: tela
 * preta eterna, sem erro visível em lugar nenhum. A correção de verdade mora
 * no processo principal (electron/main/services/embed-referer.ts, que preenche
 * o Referer); o texto aqui é a rede de segurança, pra pelo menos DIZER o que
 * aconteceu se o YouTube apertar essa regra de novo.
 */
const PLAYER_ERROR: Record<number, { title: string; body: string }> = {
  2: {
    title: 'Esse link do YouTube não presta.',
    body: 'O player recusou o id do vídeo. Cola o link de novo, direto da barra do YouTube.'
  },
  5: {
    title: 'O player do YouTube engasgou.',
    body: 'Erro do lado deles com esse vídeo. Tenta pôr de novo, ou troca por outro.'
  },
  100: {
    title: 'Esse vídeo não existe mais.',
    body: 'Foi removido ou virou privado. Só trocando por outro.'
  },
  101: {
    title: 'Esse vídeo não deixa embutir.',
    body: 'O dono do canal bloqueou o player fora do YouTube. Dá pra abrir lá e sincronizar no grito, ou trocar por outro.'
  },
  150: {
    title: 'Esse vídeo não deixa embutir.',
    body: 'O dono do canal bloqueou o player fora do YouTube. Dá pra abrir lá e sincronizar no grito, ou trocar por outro.'
  },
  153: {
    title: 'O YouTube recusou o player do launcher.',
    body: 'Isso é bug do launcher, não do vídeo — e já tem correção. Atualiza o launcher; se continuar, avisa no chat.'
  }
}

/** Código desconhecido ainda ganha um texto: melhor o número do que nada. */
export function playerErrorInfo(
  code: number | null | undefined
): { title: string; body: string } | null {
  if (typeof code !== 'number') return null
  return (
    PLAYER_ERROR[code] ?? {
      title: 'Não deu pra tocar esse vídeo.',
      body: `O player devolveu o erro ${code}. Abrir no YouTube costuma dizer o motivo.`
    }
  )
}
