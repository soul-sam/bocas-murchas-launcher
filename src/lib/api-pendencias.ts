import { request } from './api'

/**
 * PENDÊNCIAS — o que o grupo espera de mim e eu ainda não fiz.
 *
 * Calculado pelo servidor (bocas-murchas-api, lib/pendencias): agenda sem a
 * minha resposta, enquete sem o meu voto, clipe sem a minha reação. Responder
 * usa as rotas de sempre (RSVP, voto, reação) — a pendência some sozinha
 * porque a resposta passou a existir. Só "dispensar" é rota própria.
 */

export type PendenciaKind = 'agenda' | 'enquete' | 'clipe'

export interface PendenciaPessoa {
  id: string
  displayName: string
  avatar: string | null
}

export interface Pendencia {
  /** `${kind}:${refId}` */
  id: string
  kind: PendenciaKind
  refId: string
  createdAt: string
  /** Agenda: começo do evento. Enquete: fechamento. Clipe: null. */
  deadline: string | null
  channelId: string | null
  messageId: string | null
  autor: PendenciaPessoa
  agenda?: {
    title: string
    game: string | null
    note: string | null
    going: string[]
    maybe: string[]
  }
  enquete?: {
    question: string
    type: 'single' | 'multiple'
    isAnonymous: boolean
    options: Array<{ id: string; text: string; emoji: string | null; votes: number }>
    voters: number
  }
  clipe?: {
    title: string
    url: string
    mimeType: string
    durationMs: number
    participants: string[]
  }
}

/** O que chega no socket quando o servidor decide que é hora de lembrar. */
export interface PendenciaAviso {
  title: string
  body: string
  ids: string[]
}

export const pendencias = {
  async list(token: string): Promise<Pendencia[]> {
    const res = await request<{ items: Pendencia[] }>('/pendencias', { token })
    return res.items
  },

  async dispensar(token: string, kind: PendenciaKind, refId: string): Promise<void> {
    await request('/pendencias/dispensar', {
      method: 'POST',
      token,
      body: JSON.stringify({ kind, refId })
    })
  }
}
