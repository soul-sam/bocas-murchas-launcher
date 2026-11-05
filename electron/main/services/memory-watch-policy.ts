/**
 * REGRAS PURAS do vigia de memoria (memory-watch.ts). Sem Electron, sem
 * processo filho: so decisao e parse, pra rodar no `node --test`.
 *
 * Por que existe: em 05/11/2026 o PC de um usuario travou com a RAM livre do
 * Windows em ~270 MB e o launcher parado em ~1 GB. O log dizia QUE a memoria
 * acabou, mas nao QUEM comeu. Agora, quando a RAM livre cai, o log ganha os
 * processos que mais usam memoria; e de tempos em tempos, o pool do kernel
 * (vazamento de driver nao aparece na lista de processos).
 */

/** Abaixo disso o log tira retrato dos processos. Na queda real, 2062 -> 429 em 30 s. */
export const LOW_FREE_MB = 1500
/** Entre dois retratos de processos. Na pressao o pulso e de 30 s; um retrato por minuto basta. */
export const SNAPSHOT_COOLDOWN_MS = 60_000
/** Entre duas leituras do pool do kernel/commit. Tendencia, nao alarme. */
export const SYSTEM_SAMPLE_MS = 10 * 60_000
/** Quantos nomes de processo vao pro log. */
export const TOP_N = 8

export function shouldSnapshot(freeMb: number, lastSnapshotAt: number, now: number): boolean {
  if (!(freeMb < LOW_FREE_MB)) return false
  return lastSnapshotAt === 0 || now - lastSnapshotAt >= SNAPSHOT_COOLDOWN_MS
}

export function shouldSampleSystem(lastSampleAt: number, now: number): boolean {
  return lastSampleAt === 0 || now - lastSampleAt >= SYSTEM_SAMPLE_MS
}

export interface ProcMem {
  name: string
  mb: number
  count: number
}

/**
 * `tasklist /fo csv /nh` -> processos somados por nome (o navegador tem dezenas
 * de processos com o mesmo nome; o que importa e o total), do maior pro menor.
 *
 * A coluna de memoria vem formatada no idioma do Windows ("9.984 K" em pt-BR,
 * "9,984 K" em ingles): so os digitos contam, e e sempre KB.
 */
export function parseTasklistCsv(text: string, topN = TOP_N): ProcMem[] {
  const byName = new Map<string, { kb: number; count: number }>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('"')) continue
    const cols = line.slice(1, -1).split('","')
    if (cols.length < 5) continue
    const name = cols[0]
    const kb = Number(cols[cols.length - 1].replace(/\D/g, ''))
    if (!name || !Number.isFinite(kb)) continue
    const cur = byName.get(name) ?? { kb: 0, count: 0 }
    cur.kb += kb
    cur.count += 1
    byName.set(name, cur)
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, mb: Math.round(v.kb / 1024), count: v.count }))
    .sort((a, b) => b.mb - a.mb)
    .slice(0, topN)
}

export interface SystemMem {
  nonPagedMb: number
  pagedMb: number
  commitMb: number
  commitLimitMb: number
}

/**
 * JSON de `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory` (as classes
 * CIM nao sao traduzidas, ao contrario dos nomes de contador do typeperf).
 * Devolve null se faltar campo: melhor nao logar do que logar zero.
 */
export function parseSystemMem(json: string): SystemMem | null {
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    const mb = (k: string): number | null => {
      const v = Number(o[k])
      return Number.isFinite(v) && v > 0 ? Math.round(v / 1048576) : null
    }
    const nonPagedMb = mb('PoolNonpagedBytes')
    const pagedMb = mb('PoolPagedBytes')
    const commitMb = mb('CommittedBytes')
    const commitLimitMb = mb('CommitLimit')
    if (nonPagedMb === null || pagedMb === null || commitMb === null || commitLimitMb === null) return null
    return { nonPagedMb, pagedMb, commitMb, commitLimitMb }
  } catch {
    return null
  }
}
