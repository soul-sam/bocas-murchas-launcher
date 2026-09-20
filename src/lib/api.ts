const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.bocasmurchas.com.br/api'

/** Raiz do servidor, sem /api — usada pra montar URL de arquivo estatico. */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

/** Caminho vindo do banco pode ser relativo (/static/...), base64 ou URL cheia. */
export function resolveAssetUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) {
    return raw
  }
  return API_ORIGIN + (raw.startsWith('/') ? raw : '/' + raw)
}

/**
 * SESSÃO MORTA — um aviso só, pro app inteiro.
 *
 * Todo 401 desta API é sobre o token: ou venceu, ou o dono sumiu do banco.
 * Quem escuta é o AuthProvider, que limpa o cofre e devolve a tela de login.
 * Sem isto o 401 morria no `catch {}` de cada contexto e o launcher ficava
 * zumbi — logado na tela, recusado no servidor: aposta que não entra, saldo e
 * estatísticas congelados no último valor que deu certo.
 *
 * Só dispara quando a chamada LEVOU token: senha errada no login também
 * responde 401, e ali não há sessão nenhuma pra derrubar.
 */
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/**
 * Quando este JWT vence, em ms — lido do próprio token, sem perguntar ao
 * servidor. É só o payload (base64url); quem valida de verdade é a API.
 *
 * Token estranho volta `null`, e quem chama trata como "não sei" em vez de
 * derrubar a sessão por causa de um parse que falhou.
 */
export function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const exp = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))?.exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Exportado pra os módulos de API por feature (api-polls.ts, api-events.ts…)
 * montarem as próprias chamadas sem crescer este arquivo.
 */
export async function request<T>(
  endpoint: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    ...rest
  })

  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.()
    const body = await res.json().catch(() => ({ error: 'Falha na requisição' }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return null as T
  return res.json()
}

/** Upload usa FormData: nao pode mandar Content-Type manual (o boundary se perde). */
export async function upload<T>(
  endpoint: string,
  form: FormData,
  token: string | null
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form
  })

  if (!res.ok) {
    if (res.status === 401 && token) unauthorizedHandler?.()
    const body = await res.json().catch(() => ({ error: 'Falha no upload' }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }

  return res.json()
}

/**
 * Upload que sabe dizer QUANTO ja subiu.
 *
 * XMLHttpRequest e nao `fetch` porque o fetch do navegador nao tem evento de
 * progresso de ENVIO — `duplex: 'half'` com stream no corpo e suportado em
 * quase nenhum lugar que a gente usa. E o video precisa: 100 MB numa internet
 * de casa e mais de um minuto olhando pra um spinner parado, e a pessoa
 * desiste achando que travou.
 */
export function uploadWithProgress<T>(
  endpoint: string,
  form: FormData,
  token: string | null,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${endpoint}`)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      let body: { error?: string } | T = {} as T
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Resposta que nao e JSON so importa quando deu errado; o erro
        // generico abaixo cobre.
      }

      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T)

      if (xhr.status === 401 && token) unauthorizedHandler?.()

      // 413 quase nunca e a API: e o nginx da frente cortando o corpo antes de
      // chegar nela, e a resposta vem em HTML, sem `error` nenhum pra mostrar.
      // Sem esta linha a pessoa via "HTTP 413" depois de esperar o upload
      // inteiro.
      const message =
        (body as { error?: string })?.error ||
        (xhr.status === 413
          ? 'O servidor cortou o envio por tamanho. Tenta um arquivo menor.'
          : `HTTP ${xhr.status}`)
      reject(new ApiError(xhr.status, message))
    }

    // Rede caiu, CORS barrou, upload cancelado: nenhum deles tem status.
    xhr.onerror = () => reject(new ApiError(0, 'Falha no upload'))
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelado'))

    xhr.send(form)
  })
}

// ============================================
// AUTENTICACAO
// ============================================

export type UserStatus = 'online' | 'away' | 'dnd' | 'offline'

export interface ProfileLink {
  name: string
  url: string
}

export interface AuthUser {
  id: string
  username: string
  email?: string
  displayName: string
  role: 'member' | 'admin'
  avatar?: string | null
  banner?: string | null
  bio?: string | null
  pronouns?: string | null
  profileColor?: string | null
  /** JSON string de ProfileLink[] — use parseLinks(). */
  links?: string | null
  status?: UserStatus
  customStatus?: string | null
  lastSeen?: string
  createdAt?: string
  voiceChannelId?: string | null
  /** Cosméticos equipados (ids de Cosmetic) — ver gamificação. */
  title?: string | null
  nameEffect?: string | null
  avatarFrame?: string | null
  emoji?: string | null
  /** Som de entrar/sair do canal de voz (id `sound:*`); todo mundo no canal ouve. */
  joinSound?: string | null
  /** Riot ID lido do cliente do LoL. */
  riotGameName?: string | null
  riotTagLine?: string | null
  /** Dia do aniversário como "MM-DD". Sem ano — ninguém pediu idade. */
  birthday?: string | null
  /** Fuso IANA ("America/Sao_Paulo"), pro perfil mostrar a hora local. */
  timezone?: string | null
  /** JSON string de string[] — use parseFavoriteGames(). */
  favoriteGames?: string | null
}

// Tipos de presença de jogo, compartilhados com o processo main.
export type {
  GameActivity,
  ActivityGame,
  LolPhase,
  LolStatus,
  LolGameResult
} from '../../electron/preload/types'

/**
 * Jogos favoritos, guardados como JSON string igual aos links.
 *
 * Mesma tolerância do parseLinks: campo estragado no banco não pode derrubar
 * o cartão de perfil de quem abre — devolve lista vazia e a vida segue.
 */
export function parseFavoriteGames(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : []
  } catch {
    return []
  }
}

export function parseLinks(raw: string | null | undefined): ProfileLink[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface RawAuthResponse {
  message: string
  token: string
  user: AuthUser
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export const auth = {
  async login(login: string, password: string): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password })
    })
    return { token: res.token, user: res.user }
  },

  async register(payload: {
    username: string
    email: string
    password: string
    displayName: string
    inviteCode: string
  }): Promise<AuthResponse> {
    const res = await request<RawAuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    return { token: res.token, user: res.user }
  },

  async me(token: string): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>('/auth/me', { token })
    return res.user
  },

  /**
   * Estica a sessão por mais 7 dias. Só funciona com token VIVO: vencido volta
   * 401 e a pessoa entra de novo com senha (ver POST /auth/refresh na API).
   */
  async refresh(token: string): Promise<string> {
    const res = await request<{ token: string }>('/auth/refresh', { method: 'POST', token })
    return res.token
  }
}

// ============================================
// USUARIOS E PERFIL
// ============================================

export interface ProfilePatch {
  displayName?: string
  avatar?: string | null
  banner?: string | null
  bio?: string | null
  pronouns?: string | null
  profileColor?: string | null
  links?: ProfileLink[] | null
  customStatus?: string | null
  /** "MM-DD" ou null pra limpar. */
  birthday?: string | null
  /** Fuso IANA ou null pra limpar. */
  timezone?: string | null
  favoriteGames?: string[] | null
}

export const users = {
  async list(token: string): Promise<AuthUser[]> {
    const res = await request<{ users: AuthUser[] }>('/users', { token })
    return res.users
  },

  async get(token: string, id: string): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>(`/users/${id}`, { token })
    return res.user
  },

  async updateProfile(token: string, patch: ProfilePatch): Promise<AuthUser> {
    const res = await request<{ user: AuthUser }>('/users/me', {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.user
  },

  async setStatus(token: string, status: UserStatus): Promise<void> {
    await request('/users/me/status', {
      method: 'PUT',
      token,
      body: JSON.stringify({ status })
    })
  },

  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    await request('/users/me/password', {
      method: 'PUT',
      token,
      body: JSON.stringify({ currentPassword, newPassword })
    })
  }
}

// ============================================
// UPLOADS
// ============================================

export interface UploadedFile {
  url: string
  fileName: string
  sizeBytes: number
  mimeType: string
}

export const uploads = {
  async image(
    token: string,
    kind: 'avatar' | 'banner' | 'image',
    file: File
  ): Promise<{ url: string }> {
    const form = new FormData()
    form.append('file', file)
    return upload<{ url: string }>(`/uploads/${kind}`, form, token)
  },

  /**
   * Anexo que nao e imagem (zip, pdf, log, mod).
   *
   * Rota separada de proposito: o limite e outro (50 MB contra 8 MB), o
   * servidor grava direto no disco em vez de segurar na memoria, e a lista de
   * formatos aceitos e praticamente aberta.
   */
  async file(token: string, file: File): Promise<UploadedFile> {
    const form = new FormData()
    form.append('file', file)
    return upload<UploadedFile>('/uploads/file', form, token)
  },

  /**
   * Video que vai TOCAR na conversa.
   *
   * Rota propria pelos mesmos motivos da de arquivo, e mais um: o teto e de
   * 100 MB (video de celular passa de 50 MB sem esforco) e o servidor devolve
   * o MIME pela extensao com que gravou, que e o que o launcher olha depois
   * pra desenhar player em vez de cartao de download.
   *
   * O `onProgress` existe porque 100 MB demora — ver uploadWithProgress.
   */
  async video(
    token: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<UploadedFile> {
    const form = new FormData()
    form.append('file', file)
    return uploadWithProgress<UploadedFile>('/uploads/video', form, token, onProgress)
  },

  /**
   * Copia uma imagem de uma URL pro nosso storage e devolve a URL local.
   *
   * É por aqui que o GIF escolhido no seletor entra no perfil. O servidor
   * baixa e guarda em vez de a gente salvar o link do Giphy direto, porque
   * aquela URL carrega um token com validade — o avatar apareceria quebrado
   * semanas depois. Ver a rota em routes/uploads.routes.ts.
   */
  async fromUrl(
    token: string,
    kind: 'avatar' | 'banner',
    url: string
  ): Promise<{ url: string; sizeBytes: number; mimeType: string }> {
    return request('/uploads/from-url', {
      method: 'POST',
      token,
      body: JSON.stringify({ kind, url })
    })
  }
}

// ============================================
// CANAIS
// ============================================

/**
 * O tipo do canal.
 *
 * 'dm' NAO existe no servidor: e um canal sintetico que o chat-context cria
 * por cima de cada conversa direta, pra que a tela de conversa seja
 * literalmente a mesma tela de canal. Ver lib/chat-context.tsx.
 */
/**
 * `lol` é o mural de partidas: um canal de texto que ninguém escreve. Quem
 * posta nele é o servidor, quando uma partida acaba — e ele traz junto o
 * painel de estatísticas (components/social/lol).
 */
export type ChannelType = 'text' | 'voice' | 'announcements' | 'suggestions' | 'lol' | 'dm'

/**
 * O que NASCE em cada canal.
 *
 * Espelha `FEEDS` de lib/channel-routing.ts na API — a lista vive nos dois
 * lados porque o servidor precisa dela pra rotear e o gerenciador de canais
 * precisa dela pra desenhar as opcoes. Feed que o servidor nao conhece e
 * ignorado por ele, entao o pior caso de as duas listas divergirem e uma
 * opcao que nao faz nada, e nao um card perdido.
 */
export const CHANNEL_FEEDS = [
  'agenda',
  'enquetes',
  'jogos',
  'apostas',
  'clipes',
  'sistema',
  'sugestoes'
] as const

export type ChannelFeed = (typeof CHANNEL_FEEDS)[number]

export const FEED_LABEL: Record<ChannelFeed, string> = {
  agenda: 'Eventos marcados',
  enquetes: 'Enquetes',
  jogos: 'Pos-jogo, party e fumaca',
  apostas: 'Apostas e lojinha',
  clipes: 'Clipes da call',
  sistema: 'Recap, fechamento do dia e avisos',
  sugestoes: 'Sugestoes'
}

/** "agenda,jogos" -> ['agenda','jogos']. Feed desconhecido cai fora. */
export function parseChannelFeeds(raw: string | null | undefined): ChannelFeed[] {
  if (!raw) return []
  const known = new Set<string>(CHANNEL_FEEDS)
  const out: ChannelFeed[] = []
  for (const piece of raw.split(',')) {
    const value = piece.trim().toLowerCase()
    if (known.has(value) && !out.includes(value as ChannelFeed)) out.push(value as ChannelFeed)
  }
  return out
}

export interface VoiceUser {
  id: string
  displayName: string
  avatar?: string | null
  status?: string
}

export interface Channel {
  id: string
  name: string
  description?: string | null
  type: ChannelType
  icon?: string | null
  position: number
  isPrivate: boolean
  /** Grupo na barra lateral. Sem categoria, o canal cai em "Outros". */
  category?: string | null
  /** CSV do que nasce aqui — ler com `parseChannelFeeds`. */
  feeds?: string | null
  voiceUsers?: VoiceUser[]
  _count?: { messages: number }
}

export const channels = {
  async list(token: string): Promise<Channel[]> {
    const res = await request<{ channels: Channel[] }>('/channels', { token })
    return res.channels
  },

  async create(
    token: string,
    payload: {
      name: string
      description?: string
      type?: ChannelType
      icon?: string
      category?: string | null
      feeds?: ChannelFeed[]
    }
  ): Promise<Channel> {
    const res = await request<{ channel: Channel }>('/channels', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.channel
  },

  async update(
    token: string,
    id: string,
    patch: {
      name?: string
      description?: string | null
      icon?: string | null
      category?: string | null
      // Omitir `feeds` preserva o que ja estava la; mandar [] limpa de verdade.
      feeds?: ChannelFeed[]
    }
  ): Promise<Channel> {
    const res = await request<{ channel: Channel }>(`/channels/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.channel
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/channels/${id}`, { method: 'DELETE', token })
  },

  /** A ordem INTEIRA de uma vez — ver o comentario na rota. */
  async reorder(token: string, order: string[]): Promise<Channel[]> {
    const res = await request<{ channels: Channel[] }>('/channels/reorder', {
      method: 'POST',
      token,
      body: JSON.stringify({ order: order.map((id, position) => ({ id, position })) })
    })
    return res.channels
  },

  /**
   * Cria os canais que faltam e preenche categoria/feeds dos que ja existem.
   *
   * Nao sobrescreve nada nem mexe na ordem — ver a rota. Devolve o que mudou
   * pra tela poder dizer o que aconteceu em vez de um "pronto!" cego.
   */
  async seedDefaults(
    token: string
  ): Promise<{ message: string; created: string[]; organized: string[] }> {
    return request<{ message: string; created: string[]; organized: string[] }>(
      '/channels/seed',
      { method: 'POST', token }
    )
  }
}

// ============================================
// MENSAGENS
// ============================================

export interface MessageAuthor {
  id: string
  username: string
  displayName: string
  avatar?: string | null
  role: string
}

export interface MessageReaction {
  id: string
  emoji: string
  userId: string
  user?: { id: string; displayName: string }
}

/**
 * Mensagens-cartão: o launcher desenha um componente em vez do texto. O que
 * o cartão precisa vem em `metadata` (JSON) — ver components/cards.
 */
export type CardMessageType =
  | 'poll'
  | 'event'
  | 'game'
  | 'recap'
  | 'party'
  | 'wager'
  | 'watch'
  | 'system'
  | 'chess'
  | 'suggestion'
  /** Sinal de fumaça: "entro em 20 min". */
  | 'smoke'
  /** Fechamento do dia, 23h. */
  | 'dayrecap'
  /** "Naquele dia": o que o grupo fazia nesta data lá atrás. */
  | 'memory'
  /** Os últimos segundos da call, salvos por alguém. */
  | 'clip'

export type MessageType = 'text' | 'gif' | 'sticker' | 'image' | 'file' | 'video' | CardMessageType

export const CARD_MESSAGE_TYPES: ReadonlySet<string> = new Set<CardMessageType>([
  'poll',
  'event',
  'game',
  'recap',
  'party',
  'wager',
  'watch',
  'system',
  'chess',
  'suggestion',
  'smoke',
  'dayrecap',
  'memory',
  'clip'
])

export function isCardMessage(message: { type: string }): boolean {
  return CARD_MESSAGE_TYPES.has(message.type)
}

/** `metadata` vem como string JSON; devolve objeto ou null sem estourar. */
export function parseMetadata<T = Record<string, unknown>>(
  raw: string | null | undefined
): T | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}

export interface ChatMessage {
  id: string
  content: string
  type: MessageType
  /** JSON por tipo de cartão — use parseMetadata(). */
  metadata?: string | null
  gifUrl?: string | null
  stickerUrl?: string | null
  imageUrl?: string | null
  /**
   * Anexo generico (zip, pdf, log, mod) — e tambem o VIDEO. O nome original
   * vem separado, e quem decide tocar em vez de oferecer download e o
   * `fileMime` (ver lib/attachments.ts).
   */
  fileUrl?: string | null
  fileName?: string | null
  fileSize?: number | null
  fileMime?: string | null
  author: MessageAuthor
  /** Uma das duas vem preenchida: mensagem de canal OU de conversa direta. */
  channelId?: string | null
  conversationId?: string | null
  /** So nos resultados de busca, pra dizer ONDE a mensagem estava. */
  channel?: { id: string; name: string; type: ChannelType } | null
  replyToId?: string | null
  replyTo?: {
    id: string
    content: string
    author: { displayName: string }
  } | null
  reactions?: MessageReaction[]
  /**
   * Gorjetas recebidas. Vem junto com a mensagem (não numa chamada à parte)
   * porque o chip é desenhado ao lado das reações — ver lib/message-include
   * no servidor.
   */
  tips?: MessageTip[]
  isEdited: boolean
  isPinned: boolean
  createdAt: string
}

export interface MessageTip {
  id: string
  amount: number
  createdAt: string
  from: { id: string; displayName: string; avatar?: string | null }
}

/** Mesmo corpo pro canal e pra conversa: as duas rotas aceitam os mesmos campos. */
export interface SendMessagePayload {
  content: string
  type?: ChatMessage['type']
  imageUrl?: string
  gifUrl?: string
  stickerUrl?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileMime?: string
  replyToId?: string
  /** Objeto: o servidor guarda como JSON. */
  metadata?: Record<string, unknown>
}

export const messages = {
  async list(
    token: string,
    channelId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    const query = params.toString()

    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/channel/${channelId}${query ? '?' + query : ''}`,
      { token }
    )
    return res.messages
  },

  async send(
    token: string,
    channelId: string,
    payload: SendMessagePayload
  ): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/messages/channel/${channelId}`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.message
  },

  async edit(token: string, id: string, content: string): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/messages/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ content })
    })
    return res.message
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/messages/${id}`, { method: 'DELETE', token })
  },

  async react(
    token: string,
    id: string,
    emoji: string
  ): Promise<{ action: 'added' | 'removed' }> {
    return request<{ action: 'added' | 'removed' }>(`/messages/${id}/react`, {
      method: 'POST',
      token,
      body: JSON.stringify({ emoji })
    })
  },

  /**
   * Gorjeta: murchos de quem leu pra quem escreveu.
   *
   * Devolve a lista COMPLETA de gorjetas da mensagem, não só a nova — assim o
   * chip é redesenhado a partir de um estado inteiro em vez de somado à mão,
   * e não fica torto se dois cliques chegarem juntos.
   */
  async tip(token: string, id: string, amount: number): Promise<MessageTip[]> {
    const res = await request<{ tips: MessageTip[] }>(`/messages/${id}/tip`, {
      method: 'POST',
      token,
      body: JSON.stringify({ amount })
    })
    return res.tips ?? []
  },

  async togglePin(token: string, id: string): Promise<{ isPinned: boolean }> {
    return request<{ isPinned: boolean }>(`/messages/${id}/pin`, {
      method: 'POST',
      token
    })
  },

  async listPinned(token: string, channelId: string): Promise<ChatMessage[]> {
    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/channel/${channelId}/pinned`,
      { token }
    )
    return res.messages
  },

  /**
   * Busca no historico.
   *
   * O servidor so devolve o que VOCE pode ver: canais (abertos a todos) mais
   * as conversas diretas de que voce participa. DM de terceiro nunca entra no
   * resultado — a checagem e la, nao aqui.
   */
  async search(
    token: string,
    term: string,
    options: { channelId?: string; authorId?: string; limit?: number } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams({ q: term })
    if (options.channelId) params.set('channelId', options.channelId)
    if (options.authorId) params.set('authorId', options.authorId)
    if (options.limit) params.set('limit', String(options.limit))

    const res = await request<{ messages: ChatMessage[] }>(
      `/messages/search?${params.toString()}`,
      { token }
    )
    return res.messages
  }
}

// ============================================
// CONVERSAS DIRETAS
// ============================================

export interface ConversationPeer {
  id: string
  username: string
  displayName: string
  avatar?: string | null
  status?: UserStatus
  profileColor?: string | null
}

export interface Conversation {
  id: string
  other: ConversationPeer
  lastMessageAt: string
  lastMessage?: {
    id: string
    content: string
    imageUrl?: string | null
    fileName?: string | null
    createdAt: string
    authorId: string
  } | null
  unread: number
}

export const dm = {
  async list(token: string): Promise<Conversation[]> {
    const res = await request<{ conversations: Conversation[] }>('/dm', { token })
    return res.conversations
  },

  /** Abre a conversa com alguem — cria na primeira vez. */
  async open(token: string, userId: string): Promise<Conversation> {
    const res = await request<{ conversation: Conversation }>(`/dm/with/${userId}`, {
      method: 'POST',
      token
    })
    return res.conversation
  },

  async messages(
    token: string,
    conversationId: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<ChatMessage[]> {
    const params = new URLSearchParams()
    if (options.limit) params.set('limit', String(options.limit))
    if (options.before) params.set('before', options.before)
    const query = params.toString()

    const res = await request<{ messages: ChatMessage[] }>(
      `/dm/${conversationId}/messages${query ? '?' + query : ''}`,
      { token }
    )
    return res.messages
  },

  async send(
    token: string,
    conversationId: string,
    payload: SendMessagePayload
  ): Promise<ChatMessage> {
    const res = await request<{ message: ChatMessage }>(`/dm/${conversationId}/messages`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.message
  },

  async markRead(token: string, conversationId: string): Promise<void> {
    await request(`/dm/${conversationId}/read`, { method: 'POST', token })
  },

  /**
   * Fecha a conversa PRA MIM. Nada e apagado: some da lista e volta se a
   * pessoa mandar mensagem nova (ou se eu abrir a DM de novo).
   */
  async close(token: string, conversationId: string): Promise<void> {
    await request(`/dm/${conversationId}`, { method: 'DELETE', token })
  }
}

// ============================================
// SOUNDBOARD
// ============================================

export interface Sound {
  id: string
  name: string
  emoji: string
  url: string
  durationMs: number
  sizeBytes: number
  volume: number
  category: string
  playCount: number
  isBlocked: boolean
  createdAt: string
  uploadedBy: { id: string; displayName: string; avatar?: string | null }
}

export const sounds = {
  async list(token: string): Promise<Sound[]> {
    const res = await request<{ sounds: Sound[] }>('/sounds', { token })
    return res.sounds
  },

  async create(
    token: string,
    payload: {
      file: File
      name: string
      emoji: string
      durationMs: number
      category?: string
      volume?: number
    }
  ): Promise<Sound> {
    const form = new FormData()
    form.append('file', payload.file)
    form.append('name', payload.name)
    form.append('emoji', payload.emoji)
    form.append('durationMs', String(Math.round(payload.durationMs)))
    if (payload.category) form.append('category', payload.category)
    if (payload.volume !== undefined) form.append('volume', String(payload.volume))

    const res = await upload<{ sound: Sound }>('/sounds', form, token)
    return res.sound
  },

  async update(
    token: string,
    id: string,
    patch: {
      name?: string
      emoji?: string
      category?: string
      volume?: number
    }
  ): Promise<Sound> {
    const res = await request<{ sound: Sound }>(`/sounds/${id}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    })
    return res.sound
  },

  async remove(token: string, id: string): Promise<void> {
    await request(`/sounds/${id}`, { method: 'DELETE', token })
  }
}

// ============================================
// LIVEKIT
// ============================================

export const livekit = {
  async token(token: string, roomName: string): Promise<{ token: string; url: string }> {
    return request<{ token: string; url: string }>('/livekit/token', {
      method: 'POST',
      token,
      body: JSON.stringify({ roomName })
    })
  }
}

// ============================================
// PARTIDAS (presença de jogo -> servidor)
// ============================================

export interface GameSessionSummary {
  id: string
  userId: string
  game: 'lol' | 'minecraft'
  startedAt: string
  endedAt?: string | null
  result?: 'win' | 'loss' | 'remake' | 'unknown' | null
  queue?: string | null
  champion?: string | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  durationSec?: number | null
  messageId?: string | null
}

/**
 * Contrato com /api/games (implementado no backend pelo módulo de partidas).
 *
 *   POST /games/session            { game, queue?, champion?, startedAt }      -> { session }
 *   POST /games/session/:id/end    { result, kills, deaths, assists, durationSec,
 *                                    champion?, queue?, data?, teammateRiotIds?,
 *                                    postCard }                                -> { session, message? }
 *   POST /games/riot-id            { gameName, tagLine }                       -> { user }
 *   GET  /games/recent?limit=      -> { sessions }  (com user)
 *   GET  /games/live               -> { sessions }  partidas em andamento (pra apostar)
 */
export const games = {
  async start(
    token: string,
    payload: { game: 'lol' | 'minecraft'; queue?: string; champion?: string; startedAt: string }
  ): Promise<GameSessionSummary> {
    const res = await request<{ session: GameSessionSummary }>('/games/session', {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
    return res.session
  },

  async end(
    token: string,
    sessionId: string,
    payload: {
      result: 'win' | 'loss' | 'remake' | 'unknown'
      kills: number
      deaths: number
      assists: number
      durationSec: number
      champion?: string
      queue?: string
      data?: unknown
      /** Riot IDs (nome#tag) dos aliados — o servidor resolve quem é do grupo. */
      teammateRiotIds?: string[]
      postCard: boolean
    }
  ): Promise<{ session: GameSessionSummary; message?: ChatMessage }> {
    return request(`/games/session/${sessionId}/end`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload)
    })
  },

  async setRiotId(token: string, gameName: string, tagLine: string): Promise<void> {
    await request('/games/riot-id', {
      method: 'POST',
      token,
      body: JSON.stringify({ gameName, tagLine })
    })
  }
}

// ============================================
// ADMIN
// ============================================

export interface InviteSummary {
  id: string
  code: string
  maxUses: number
  uses: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  createdBy?: { displayName: string }
}

export const admin = {
  async createInvite(
    token: string,
    options: { maxUses?: number; expiresInDays?: number } = {}
  ): Promise<{ code: string; maxUses: number; expiresAt: string | null }> {
    const res = await request<{
      invite: { code: string; maxUses: number; expiresAt: string | null }
    }>('/auth/invite', {
      method: 'POST',
      token,
      body: JSON.stringify({
        maxUses: options.maxUses ?? 1,
        ...(options.expiresInDays !== undefined
          ? { expiresInDays: options.expiresInDays }
          : {})
      })
    })
    return res.invite
  },

  async listInvites(token: string): Promise<InviteSummary[]> {
    const res = await request<{ invites: InviteSummary[] }>('/auth/invites', { token })
    return res.invites
  },

  async deactivateInvite(token: string, id: string): Promise<void> {
    await request('/auth/invite/' + id, { method: 'DELETE', token })
  }
}
