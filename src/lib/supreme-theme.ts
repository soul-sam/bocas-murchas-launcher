export type SupremeThemeConfig = { mode: 'light' | 'dark'; c1: string; c2: string }

/** Rosa/roxo murcho — o que vale até a pessoa escolher, ou se perder uma cor. */
export const DEFAULT_SUPREME_THEME: SupremeThemeConfig = { mode: 'dark', c1: '#FF6FD8', c2: '#8B5CF6' }

/**
 * Fundo base de cada modo. É o MESMO valor de `--background` no bloco
 * `[data-theme='supremo']` do globals.css, que escreve em HSL:
 *   escuro  #0B0910 = 257 28% 4.9%
 *   claro   #F7F5FA = 264 33% 97.1%
 * Mudou aqui, muda lá (e vice-versa).
 */
export const SUPREME_BG = { dark: '#0B0910', light: '#F7F5FA' } as const

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
function toHex(rgb: number[]): string {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

/** "H S% L%" — o formato dos tokens do globals.css (`hsl(var(--x))`). */
export function hexToHslTriplet(hex: string): string {
  const [r, g, b] = channels(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 1000) / 10}%`
}

/** Escurece (fundo claro) ou clareia (fundo escuro) em passos de 5% até bater `min`. */
export function ensureContrast(hex: string, bg: string, min: number): string {
  if (contrastRatio(hex, bg) >= min) return hex
  const target = luminance(bg) > 0.5 ? 0 : 255
  const base = channels(hex)
  for (let t = 0.05; t <= 1; t += 0.05) {
    const out = toHex(base.map((v) => v + (target - v) * t))
    if (contrastRatio(out, bg) >= min) return out
  }
  return toHex(base.map(() => target))
}

/** Texto sobre um fundo `hex`: preto ou branco, o que contrastar mais. */
function onColor(hex: string): string {
  return contrastRatio('#0a0a0a', hex) >= contrastRatio('#ffffff', hex) ? '0 0% 4%' : '0 0% 100%'
}

/**
 * Variáveis do <html> no tema Supremo. Os tokens do globals.css são tripletos
 * HSL, então além do hex (`--theme-c1`/`--theme-c2`, já com contraste mínimo de
 * 3:1 contra o fundo do modo) saem as versões em tripleto que o CSS consome:
 *  - `-hsl`      a cor (botão, destaque, anel de foco)
 *  - `-text-hsl` a cor com 4,5:1, pra usar como cor de TEXTO
 *  - `-on-hsl`   texto legível em cima da cor (rótulo de botão)
 *  - `-dim-hsl`  a cor 70% diluída no fundo (borda de estado, `--acid-dark`)
 *  - `-rgb`      "r g b", pro halo (`--neon-rgb`)
 */
export function supremeThemeVars(cfg: SupremeThemeConfig): Record<string, string> {
  const bg = SUPREME_BG[cfg.mode]
  const out: Record<string, string> = {}
  for (const [key, raw] of [['c1', cfg.c1], ['c2', cfg.c2]] as const) {
    const hex = ensureContrast(raw, bg, 3)
    out[`--theme-${key}`] = hex
    out[`--theme-${key}-hsl`] = hexToHslTriplet(hex)
    out[`--theme-${key}-text-hsl`] = hexToHslTriplet(ensureContrast(raw, bg, 4.5))
    out[`--theme-${key}-on-hsl`] = onColor(hex)
    const base = channels(bg)
    out[`--theme-${key}-dim-hsl`] = hexToHslTriplet(toHex(channels(hex).map((v, i) => v * 0.3 + base[i] * 0.7)))
    out[`--theme-${key}-rgb`] = channels(hex).join(' ')
  }
  return out
}
