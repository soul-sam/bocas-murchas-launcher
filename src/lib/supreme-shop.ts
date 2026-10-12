// Ids literais (iguais a SUPREME_IDS): importar api-gamification arrastaria o
// bundle da API pro teste de node.
const COLOR_ID = 'namecolor:supremo'
const THEME_ID = 'theme:supremo'

import type { SupremeSoundState } from './api-supreme-sound'

export interface OwnedColor {
  id: string
  name: string
  color: string
}

/** Cor Suprema e Tema Supremo pedem 2 cores de nome comuns antes de comprar. */
export function needsColors(itemId: string, ownedCount: number): boolean {
  return (itemId === COLOR_ID || itemId === THEME_ID) && ownedCount < 2
}

/** Cores de nome que a pessoa tem, na ordem da prateleira. */
export function ownedNameColors(
  items: { id: string; name: string; type: string; owned?: boolean; data?: Record<string, unknown> | null }[]
): OwnedColor[] {
  const out: OwnedColor[] = []
  for (const i of items) {
    if (i.type !== 'nameColor' || !i.owned || i.id === COLOR_ID) continue
    const hex = i.data?.color
    if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex)) out.push({ id: i.id, name: i.name, color: hex })
  }
  return out
}

/** "Usar mesmo áudio" já vem marcado quando entrada e saída são o mesmo arquivo. */
export function deriveUseSame(state: Pick<SupremeSoundState, 'joinSoundUrl' | 'leaveSoundUrl'> | null): boolean {
  return !!state?.joinSoundUrl && state.joinSoundUrl === state.leaveSoundUrl
}

export function soundByUrl(state: SupremeSoundState | null, url: string | null) {
  return url ? state?.sounds.find((s) => s.url === url) : undefined
}

/** Histórico "Recentes": o que não está em uso, no máximo 3. */
export function recentSounds(state: SupremeSoundState | null) {
  return (state?.sounds ?? []).filter((s) => !s.inUse).slice(0, 3)
}
