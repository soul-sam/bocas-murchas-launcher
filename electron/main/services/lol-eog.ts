import type { LolGameResult, LolLobbyMember } from '../../preload/types.js'
import { queueName } from './lol-client.js'

/**
 * TRADUZIR O BLOCO DE FIM DE JOGO DA LCU (`/lol-end-of-game/v1/eog-stats-block`)
 * pro `LolGameResult` que o card de pos-jogo e o recap usam.
 *
 * O bloco e grande e cheio de coisa que nao interessa (XP, boosts, caminhos
 * de splash art). Tiramos o que a tela mostra e guardamos o resto em `raw`
 * pro servidor — com teto de tamanho, porque os itens de dez jogadores sao o
 * que mais pesa e o que menos vale.
 */

export interface EogPlayer {
  puuid?: string
  summonerId?: number
  summonerName?: string
  riotIdGameName?: string
  riotIdTagLine?: string
  championName?: string
  teamId?: number
  isLocalPlayer?: boolean
  botPlayer?: boolean
  stats?: Record<string, unknown>
  items?: unknown
}

export interface EogTeam {
  teamId?: number
  isPlayerTeam?: boolean
  isWinningTeam?: boolean
  players?: EogPlayer[]
}

export interface EogStatsBlock {
  gameId?: number
  queueId?: number
  /** Segundos. */
  gameLength?: number
  gameEndedInEarlySurrender?: boolean
  teamEarlySurrendered?: boolean
  localPlayer?: EogPlayer
  teams?: EogTeam[]
  [key: string]: unknown
}

const RAW_MAX_CHARS = 200_000
// Remake so acontece ate 3:00 (3:30 com afk). 5 minutos e folga segura: nao
// existe rendicao legitima antes disso em fila nenhuma.
const REMAKE_MAX_SEC = 300

/** O bloco existe e tem o minimo pra virar resultado. */
export function isUsableEogBlock(block: unknown): block is EogStatsBlock {
  if (!block || typeof block !== 'object') return false
  const b = block as EogStatsBlock
  return (
    typeof b.gameId === 'number' &&
    b.gameId > 0 &&
    !!b.localPlayer &&
    typeof b.localPlayer === 'object'
  )
}

function stat(stats: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = stats?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function riotIdOf(player: EogPlayer): string | undefined {
  if (player.riotIdGameName) {
    return player.riotIdTagLine
      ? `${player.riotIdGameName}#${player.riotIdTagLine}`
      : player.riotIdGameName
  }
  return player.summonerName || undefined
}

function samePlayer(a: EogPlayer, b: EogPlayer): boolean {
  if (a.puuid && b.puuid) return a.puuid === b.puuid
  if (a.summonerId && b.summonerId) return a.summonerId === b.summonerId
  const idA = riotIdOf(a)
  return idA !== undefined && idA === riotIdOf(b)
}

function myTeam(block: EogStatsBlock): EogTeam | undefined {
  const teams = block.teams ?? []
  const me = block.localPlayer
  return (
    teams.find((t) => t.isPlayerTeam) ??
    teams.find((t) => t.teamId != null && t.teamId === me?.teamId) ??
    teams.find((t) => (t.players ?? []).some((p) => p.isLocalPlayer || (me ? samePlayer(p, me) : false)))
  )
}

/**
 * Primeiro tira os itens (o grosso do peso); se ainda passar do teto, tira os
 * times inteiros e fica so o jogador local. O bloco veio de JSON, entao o
 * roundtrip e uma copia profunda honesta.
 */
function capRaw(block: EogStatsBlock): unknown {
  const full = JSON.stringify(block)
  if (full.length <= RAW_MAX_CHARS) return block

  const slim = JSON.parse(full) as EogStatsBlock
  if (slim.localPlayer) delete slim.localPlayer.items
  for (const team of slim.teams ?? []) {
    for (const player of team.players ?? []) delete player.items
  }
  if (JSON.stringify(slim).length <= RAW_MAX_CHARS) return slim

  delete slim.teams
  return slim
}

export interface EogFallback {
  /** Fila e campeao vistos antes da partida, caso o bloco nao traga. */
  queue?: string
  champion?: string
}

export function eogToResult(block: EogStatsBlock, fallback: EogFallback): LolGameResult {
  const me = block.localPlayer ?? {}
  const stats = me.stats
  const gameLength = typeof block.gameLength === 'number' ? Math.max(0, Math.round(block.gameLength)) : 0

  const win = stat(stats, 'WIN')
  const remake =
    block.gameEndedInEarlySurrender === true ||
    block.teamEarlySurrendered === true ||
    (gameLength > 0 && gameLength < REMAKE_MAX_SEC)
  const result: LolGameResult['result'] = remake
    ? 'remake'
    : win === 1
      ? 'win'
      : win === 0
        ? 'loss'
        : 'unknown'

  const teammates: LolLobbyMember[] = []
  for (const player of myTeam(block)?.players ?? []) {
    if (player.isLocalPlayer || player.botPlayer || samePlayer(player, me)) continue
    const riotId = riotIdOf(player)
    if (!riotId) continue
    teammates.push({
      riotId,
      puuid: player.puuid || undefined,
      summonerId: player.summonerId || undefined
    })
  }

  const minions = stat(stats, 'MINIONS_KILLED')
  const neutral = stat(stats, 'NEUTRAL_MINIONS_KILLED')

  return {
    gameId: block.gameId,
    queue:
      typeof block.queueId === 'number' && block.queueId >= 0
        ? queueName(block.queueId)
        : fallback.queue,
    result,
    champion: me.championName || fallback.champion,
    kills: stat(stats, 'CHAMPIONS_KILLED') ?? 0,
    deaths: stat(stats, 'NUM_DEATHS') ?? 0,
    assists: stat(stats, 'ASSISTS') ?? 0,
    cs: minions === undefined && neutral === undefined ? undefined : (minions ?? 0) + (neutral ?? 0),
    gold: stat(stats, 'GOLD_EARNED'),
    damageToChampions: stat(stats, 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS'),
    visionScore: stat(stats, 'VISION_SCORE'),
    doubleKills: stat(stats, 'DOUBLE_KILLS'),
    tripleKills: stat(stats, 'TRIPLE_KILLS'),
    quadraKills: stat(stats, 'QUADRA_KILLS'),
    pentaKills: stat(stats, 'PENTA_KILLS'),
    durationSec: gameLength,
    teammates: teammates.length > 0 ? teammates : undefined,
    raw: capRaw(block),
    endedAt: Date.now()
  }
}
