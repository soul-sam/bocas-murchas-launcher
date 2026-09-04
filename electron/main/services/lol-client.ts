import https from 'node:https'
import type { LolPhase } from '../../preload/types.js'

/**
 * FALAR COM O CLIENTE DO LOL (E COM O JOGO) POR HTTPS LOCAL.
 *
 * Sao dois servidores diferentes, os dois em 127.0.0.1 com certificado
 * autoassinado da Riot:
 *
 *   - a LCU, do CLIENTE: porta e senha mudam a cada abertura, usuario `riot`;
 *   - a Live Client Data API, do JOGO: porta fixa 2999, sem senha, e so
 *     existe enquanto uma partida esta rodando.
 *
 * `rejectUnauthorized: false` aqui e seguro SO porque o host e sempre
 * 127.0.0.1, fixo no codigo: nao tem rede no meio pra alguem se passar pelo
 * cliente. Em qualquer outro host isso seria um buraco.
 */

export interface LcuConnection {
  port: number
  password: string
}

/** Resposta fora de 2xx. 404 e rotina (endpoint da fase errada); 401 e senha velha. */
export class LcuHttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string
  ) {
    super(`HTTP ${status} em ${path}`)
    this.name = 'LcuHttpError'
  }
}

const LIVE_CLIENT_PORT = 2999
const REQUEST_TIMEOUT_MS = 2_500
// champion-summary.json tem uns 40KB; eog-stats-block uns 100KB. 4MB e folga
// pra nao engolir um bug que devolva o mundo.
const MAX_BODY_BYTES = 4 * 1024 * 1024

// keepAlive: sem isso cada poll de 2s refaz o handshake TLS. E pouco, mas e
// pouco o dia inteiro.
const lcuAgent = new https.Agent({ keepAlive: true, maxSockets: 4, rejectUnauthorized: false })
const liveAgent = new https.Agent({ keepAlive: true, maxSockets: 4, rejectUnauthorized: false })

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ERR_SOCKET_TIMEOUT'
])

/**
 * "Ninguem escuta nessa porta" vs "respondeu algo que nao gostei". O primeiro
 * significa cliente fechado (ou jogo ainda carregando); o segundo, so que o
 * endpoint nao vale nessa fase.
 */
export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error) || err instanceof LcuHttpError) return false
  const code = (err as NodeJS.ErrnoException).code
  if (code && CONNECTION_ERROR_CODES.has(code)) return true
  return /timeout|socket hang up|ECONNREFUSED|ECONNRESET/i.test(err.message)
}

interface JsonRequest {
  agent: https.Agent
  port: number
  path: string
  headers?: Record<string, string>
}

function getJson<T>({ agent, port, path, headers }: JsonRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        agent,
        rejectUnauthorized: false,
        headers: { Accept: 'application/json', ...headers }
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BODY_BYTES) {
            req.destroy(new Error(`resposta grande demais em ${path}`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          const body = Buffer.concat(chunks).toString('utf8')
          if (status < 200 || status >= 300) {
            reject(new LcuHttpError(status, path, body.slice(0, 500)))
            return
          }
          if (!body.trim()) {
            resolve(undefined as T)
            return
          }
          try {
            resolve(JSON.parse(body) as T)
          } catch {
            reject(new Error(`JSON invalido em ${path}`))
          }
        })
        res.on('error', reject)
      }
    )
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(Object.assign(new Error(`timeout em ${path}`), { code: 'ETIMEDOUT' }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** GET autenticado na LCU (cliente). */
export function lcuGet<T>(conn: LcuConnection, path: string): Promise<T> {
  const auth = Buffer.from(`riot:${conn.password}`).toString('base64')
  return getJson<T>({
    agent: lcuAgent,
    port: conn.port,
    path,
    headers: { Authorization: `Basic ${auth}` }
  })
}

/** GET na Live Client Data API (jogo em andamento, porta 2999, sem senha). */
export function liveGet<T>(path: string): Promise<T> {
  return getJson<T>({ agent: liveAgent, port: LIVE_CLIENT_PORT, path })
}

/** Fecha os sockets keep-alive. Quando o cliente some, nao vale segurar nada. */
export function closeLcuAgents(): void {
  lcuAgent.destroy()
  liveAgent.destroy()
}

// ---------------- traducoes ----------------

const PHASE_MAP: Record<string, LolPhase> = {
  None: 'none',
  Lobby: 'lobby',
  Matchmaking: 'matchmaking',
  ReadyCheck: 'ready-check',
  ChampSelect: 'champ-select',
  // GameStart e a tela de carregamento: o jogo ja existe, so nao abriu. Se
  // virasse 'none' a presenca piscaria pra "nada" por 30s entre o champ
  // select e a partida.
  GameStart: 'in-progress',
  InProgress: 'in-progress',
  Reconnect: 'in-progress',
  WaitingForStats: 'end-of-game',
  PreEndOfGame: 'end-of-game',
  EndOfGame: 'end-of-game'
}

/** `/lol-gameflow/v1/gameflow-phase` devolve uma string JSON ("Lobby"). */
export function mapGameflowPhase(raw: unknown): LolPhase {
  if (typeof raw !== 'string') return 'none'
  return PHASE_MAP[raw] ?? 'none'
}

/**
 * queueId -> texto curto que o renderer sabe rotular. O que nao esta aqui
 * vira `queue_<id>`, que a tela mostra como esta — melhor que sumir a fila.
 */
const QUEUE_NAMES: Record<number, string> = {
  0: 'custom',
  400: 'normal_draft',
  430: 'normal_blind',
  490: 'normal_quickplay',
  420: 'ranked_solo',
  440: 'ranked_flex',
  450: 'aram',
  700: 'clash',
  720: 'aram_clash',
  830: 'coop',
  840: 'coop',
  850: 'coop',
  870: 'coop',
  880: 'coop',
  890: 'coop',
  900: 'urf',
  1010: 'urf',
  1900: 'urf',
  1020: 'one_for_all',
  1090: 'tft',
  1100: 'tft',
  1110: 'tft',
  1130: 'tft',
  1160: 'tft',
  1300: 'nexus_blitz',
  1400: 'ultimate_spellbook',
  1700: 'arena',
  1710: 'arena',
  2000: 'tutorial',
  2010: 'tutorial',
  2020: 'tutorial'
}

export function queueName(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `queue_${queueId}`
}
