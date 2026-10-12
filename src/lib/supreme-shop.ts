import { SUPREME_IDS } from './supreme-ids.ts'
import type { SupremeSoundState } from './api-supreme-sound.ts'
import { DEFAULT_SUPREME_THEME } from './supreme-theme.ts'
import { parseGradient } from './name-gradient.ts'

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

/**
 * Cores do Tema Supremo contra o que a pessoa tem (`owned`: hex minúsculos).
 * Cada cor vale sozinha: se é dela OU é o padrão daquela posição, fica. Só a
 * que não é nenhum dos dois volta pro padrão. null = nada a mudar.
 */
export function coherentSupremeColors(
  colors: { c1: string; c2: string },
  owned: Set<string>
): { c1: string; c2: string } | null {
  const ok = (hex: string, fallback: string): boolean =>
    hex.toLowerCase() === fallback.toLowerCase() || owned.has(hex.toLowerCase())
  const c1 = ok(colors.c1, DEFAULT_SUPREME_THEME.c1) ? colors.c1 : DEFAULT_SUPREME_THEME.c1
  const c2 = ok(colors.c2, DEFAULT_SUPREME_THEME.c2) ? colors.c2 : DEFAULT_SUPREME_THEME.c2
  return c1 === colors.c1 && c2 === colors.c2 ? null : { c1, c2 }
}

/**
 * Amostra da Cor Suprema na prateleira: o gradiente que a pessoa usa; senão
 * as 2 primeiras cores dela (o que ela poderia montar); senão o rosa→roxo
 * da raridade.
 */
export function supremeColorSample(gradient: string | null | undefined, owned: OwnedColor[]): [string, string] {
  const mine = parseGradient(gradient)
  if (mine) return mine
  if (owned.length >= 2) return [owned[0].color, owned[1].color]
  return [DEFAULT_SUPREME_THEME.c1, DEFAULT_SUPREME_THEME.c2]
}
