import { SUPREME_IDS } from './supreme-ids.ts'
import type { SupremeSoundState } from './api-supreme-sound.ts'

export interface OwnedColor {
  id: string
  name: string
  color: string
}

/** Cor Suprema e Tema Supremo pedem 2 cores de nome comuns antes de comprar. */
export function needsColors(itemId: string, ownedCount: number): boolean {
  return (itemId === SUPREME_IDS.color || itemId === SUPREME_IDS.theme) && ownedCount < 2
}

/** Cores de nome que a pessoa tem, na ordem da prateleira. */
export function ownedNameColors(
  items: { id: string; name: string; type: string; owned?: boolean; data?: Record<string, unknown> | null }[]
): OwnedColor[] {
  const out: OwnedColor[] = []
  const seen = new Set<string>()
  for (const i of items) {
    if (i.type !== 'nameColor' || !i.owned || i.id === SUPREME_IDS.color) continue
    const hex = i.data?.color
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) continue
    // Hex repetido conta uma vez só (a API conta num Set).
    if (seen.has(hex.toLowerCase())) continue
    seen.add(hex.toLowerCase())
    out.push({ id: i.id, name: i.name, color: hex })
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

/**
 * "Mesmo áudio" depois de uma resposta da API: segue o estado real (entrada ==
 * saída), exceto logo após marcar sem nenhum áudio ainda — fica marcado até uma
 * ação por slot fazer os dois diferirem.
 */
export function syncUseSame(next: Pick<SupremeSoundState, 'joinSoundUrl' | 'leaveSoundUrl'>, prev: boolean): boolean {
  return deriveUseSame(next) || (prev && !next.joinSoundUrl && !next.leaveSoundUrl)
}
