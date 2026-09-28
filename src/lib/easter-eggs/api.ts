import { request } from '../api'

/** Easter-eggs na API (src/routes/gamification.routes.ts, catálogo em lib/gamification/easter-eggs.ts). */

export type EggRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface EggClaim {
  /** true só na primeira vez que a pessoa acha. */
  fresh: boolean
  coins: number
  found: number
  total: number
}

export interface EggNotebookEntry {
  id: string
  rarity: EggRarity
  coins: number
  hint: string
  /** null enquanto a pessoa não achou. */
  name: string | null
  description: string | null
  foundAt: string | null
}

export interface EggNotebook {
  found: number
  total: number
  eggs: EggNotebookEntry[]
}

export const eggs = {
  notebook(token: string): Promise<EggNotebook> {
    return request<EggNotebook>('/gamification/eggs', { token })
  },

  claim(token: string, id: string): Promise<EggClaim> {
    return request<EggClaim>(`/gamification/eggs/${encodeURIComponent(id)}`, {
      method: 'POST',
      token
    })
  }
}
