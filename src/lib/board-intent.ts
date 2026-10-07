/**
 * O QUE EU QUERO JOGAR — o lance que mandei e ainda não voltou, e a fila de
 * pré-lances. Puro: sem React, pra rodar no `node --test`. O board-context
 * guarda isto e chama `reconcile` a cada vista nova que o servidor manda.
 *
 * Regras, as do chess.com:
 *  - o meu lance aparece na hora (otimista) e some se o servidor recusar;
 *  - pré-lance entra numa fila (mais de um vale) enquanto a vez é do outro;
 *  - quando a vez volta, o primeiro da fila sai NA HORA, se for legal na
 *    posição nova (o servidor manda os lances legais junto com a vista);
 *  - pré-lance que não vale mais cancela a fila inteira;
 *  - fim de partida, mesa nova ou lance diferente do esperado limpam tudo.
 */

import type { BoardTableView } from './api-board.ts'

export type MoveHow = 'drag' | 'click' | 'premove'

export interface PlayedMove {
  move: string
  /** Índice do lance na partida (0 = primeiro lance das brancas). */
  ply: number
  how: MoveHow
}

export interface Intent {
  tableId: string | null
  /** Meu lance já mandado e ainda não confirmado: a tela desenha ele na hora. */
  pending: PlayedMove | null
  /** Pré-lances na ordem em que vão sair. */
  premoves: string[]
  /** Como saiu o meu último lance (a tela anima clique, não anima arrasto nem pré-lance). */
  lastLocal: PlayedMove | null
}

export const EMPTY_INTENT: Intent = { tableId: null, pending: null, premoves: [], lastLocal: null }

/** Quantos pré-lances cabem na fila. */
export const PREMOVE_LIMIT = 10

export type TableLike = Pick<BoardTableView, 'id' | 'phase' | 'result' | 'mySide' | 'turn' | 'moves' | 'legalMoves'>

export function isMyTurnView(t: TableLike | null | undefined): boolean {
  return !!t && t.phase === 'playing' && !t.result && t.mySide !== null && t.turn === t.mySide
}

/** Partida em andamento em que eu jogo. */
export function playingSeat(t: TableLike | null | undefined): boolean {
  return !!t && t.phase === 'playing' && !t.result && t.mySide !== null
}

export interface Reconciled {
  intent: Intent
  /** Pré-lance que tem que sair agora (já virou o `pending`). */
  send: string | null
  /** A fila de pré-lances caiu (lance ilegal, fim de partida, mesa nova). */
  cancelled: boolean
}

/** Junta o que eu quero jogar com a vista nova do servidor. */
export function reconcile(intent: Intent, next: TableLike): Reconciled {
  if (intent.tableId !== next.id) {
    return {
      intent: { ...EMPTY_INTENT, tableId: next.id },
      send: null,
      cancelled: intent.premoves.length > 0
    }
  }
  if (!playingSeat(next)) {
    return {
      intent: { ...intent, pending: null, premoves: [] },
      send: null,
      cancelled: intent.premoves.length > 0
    }
  }

  let { pending, premoves } = intent
  let { lastLocal } = intent
  let cancelled = false

  if (pending && next.moves.length > pending.ply) {
    // O servidor já passou do meu lance. Se o lance dele ali não é o meu, a
    // fila foi pensada pra outra partida: cai junto.
    if (next.moves[pending.ply] !== pending.move) {
      cancelled = premoves.length > 0
      premoves = []
      lastLocal = null
    }
    pending = null
  }

  let send: string | null = null
  if (!pending && premoves.length > 0 && isMyTurnView(next)) {
    const [head, ...rest] = premoves
    if (next.legalMoves.includes(head)) {
      pending = { move: head, ply: next.moves.length, how: 'premove' }
      lastLocal = pending
      premoves = rest
      send = head
    } else {
      premoves = []
      cancelled = true
    }
  }

  return { intent: { tableId: next.id, pending, premoves, lastLocal }, send, cancelled }
}

/** Meu lance, na minha vez. Null quando não dá (não é a vez, ou já tem um no ar). */
export function startMove(intent: Intent, table: TableLike, move: string, how: MoveHow): Intent | null {
  if (!isMyTurnView(table) || intent.pending || intent.tableId !== table.id) return null
  if (!table.legalMoves.includes(move)) return null
  const pending: PlayedMove = { move, ply: table.moves.length, how }
  return { ...intent, pending, lastLocal: pending }
}

/** Mais um pré-lance no fim da fila. */
export function queuePremove(intent: Intent, table: TableLike, move: string): Intent | null {
  if (!playingSeat(table) || intent.tableId !== table.id) return null
  if (isMyTurnView(table) && !intent.pending) return null
  if (intent.premoves.length >= PREMOVE_LIMIT) return null
  return { ...intent, premoves: [...intent.premoves, move] }
}

export function clearPremoves(intent: Intent): Intent {
  return intent.premoves.length === 0 ? intent : { ...intent, premoves: [] }
}

/** O servidor recusou o lance: ele some da tela e a fila cai junto. */
export function failPending(intent: Intent, move: string): Intent {
  if (!intent.pending || intent.pending.move !== move) return intent
  return { ...intent, pending: null, premoves: [], lastLocal: null }
}

/** Ordem das fases: vista que volta pra trás é velha (chegou fora de ordem). */
const PHASE_ORDER: Record<BoardTableView['phase'], number> = {
  open: 0,
  invited: 0,
  pending: 1,
  playing: 2,
  finished: 3
}

/**
 * A vista chegou atrasada? O ack de um lance e o `board:table` de outro podem
 * trocar de ordem no fio; gravar a mais velha por cima desfaria um lance na tela.
 */
export function isStaleView(
  prev: Pick<BoardTableView, 'id' | 'phase' | 'moves'> | null,
  next: Pick<BoardTableView, 'id' | 'phase' | 'moves'>
): boolean {
  if (!prev || prev.id !== next.id) return false
  if (PHASE_ORDER[next.phase] < PHASE_ORDER[prev.phase]) return true
  return next.phase === prev.phase && next.phase === 'playing' && next.moves.length < prev.moves.length
}
