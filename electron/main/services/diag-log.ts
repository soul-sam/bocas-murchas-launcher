import { app, powerMonitor, screen } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * LOG DE DIAGNOSTICO — `%APPDATA%\<app>\logs\main.log`.
 *
 * Ate nov/2026 o unico arquivo que o launcher gravava era o updater.log. Um
 * usuario com o PC congelando (ver overlay-policy.ts) mandou o diagnostico do
 * Windows e nao havia como saber o que o launcher estava fazendo no segundo
 * do travamento. Este arquivo existe pra isso: a ULTIMA linha antes de um
 * travamento diz o que estava acontecendo.
 *
 * O QUE ENTRA: versao, GPUs e drivers, monitores, processos do Chromium que
 * morreram, troca de monitor, suspender/retomar, fase da partida, o que a
 * sobreposicao fez com a janela, call e tela (pelo renderer) e um pulso a
 * cada 30 s com memoria. O QUE NAO ENTRA: mensagem, nome de gente, token,
 * caminho com nome de usuario. So tipo de evento, horario e numero.
 *
 * GRAVACAO SINCRONA COM fdatasync, de proposito: o caso que importa e o PC
 * travar e ser desligado no botao. Linha que ficou no cache do sistema morre
 * junto. Sao poucas linhas por minuto, o custo nao aparece.
 *
 * Gira em 2 MB: o atual vira main.old.log, e o anterior vai embora.
 */

const MAX_BYTES = 2 * 1024 * 1024
const HEARTBEAT_MS = 30_000

let fd: number | null = null
let file = ''
let written = 0
let heartbeat: NodeJS.Timeout | null = null
const probes: Array<() => Record<string, unknown>> = []

function stamp(): string {
  const d = new Date()
  const off = -d.getTimezoneOffset()
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 23)
  const sign = off >= 0 ? '+' : '-'
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0')
  const mm = String(Math.abs(off) % 60).padStart(2, '0')
  return `${local}${sign}${hh}:${mm}`
}

function open(): void {
  const dir = path.join(app.getPath('userData'), 'logs')
  fs.mkdirSync(dir, { recursive: true })
  file = path.join(dir, 'main.log')
  try {
    written = fs.statSync(file).size
  } catch {
    written = 0
  }
  if (written >= MAX_BYTES) rotate()
  else fd = fs.openSync(file, 'a')
}

function rotate(): void {
  if (fd !== null) {
    try {
      fs.closeSync(fd)
    } catch {
      /* ja fechado */
    }
  }
  try {
    fs.renameSync(file, file.replace(/main\.log$/, 'main.old.log'))
  } catch {
    /* primeira vez: nao ha o que girar */
  }
  fd = fs.openSync(file, 'a')
  written = 0
}

/**
 * Uma linha no log. `data` vira JSON curto no fim da linha.
 * Nunca lanca: log quebrado nao pode derrubar o launcher.
 */
export function diagLog(tag: string, msg: string, data?: Record<string, unknown>): void {
  if (fd === null) return
  try {
    const extra = data ? ' ' + JSON.stringify(data) : ''
    const line = `${stamp()} [${tag}] ${msg}${extra}\n`
    const buf = Buffer.from(line, 'utf8')
    if (written + buf.length > MAX_BYTES) rotate()
    fs.writeSync(fd, buf)
    fs.fdatasyncSync(fd)
    written += buf.length
  } catch {
    /* disco cheio, permissao: segue sem log */
  }
}

/** Quem tem estado pra mostrar no pulso (sobreposicao, partida) se registra aqui. */
export function addDiagProbe(probe: () => Record<string, unknown>): void {
  probes.push(probe)
}

function displays(): unknown[] {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    scale: d.scaleFactor,
    hz: d.displayFrequency,
    internal: d.internal,
    primary: d.id === screen.getPrimaryDisplay().id
  }))
}

async function logGpu(): Promise<void> {
  try {
    const info = (await app.getGPUInfo('basic')) as {
      gpuDevice?: Array<{ vendorId: number; deviceId: number; active: boolean; driverVersion?: string }>
    }
    const gpus = (info.gpuDevice ?? []).map((g) => ({
      vendor: '0x' + g.vendorId.toString(16),
      device: '0x' + g.deviceId.toString(16),
      active: g.active,
      driver: g.driverVersion
    }))
    diagLog('gpu', 'placas', { gpus })
  } catch (err) {
    diagLog('gpu', 'placas indisponiveis', { err: String(err) })
  }
}

function pulse(): void {
  let rssMb = 0
  try {
    rssMb = Math.round(
      app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0) / 1024
    )
  } catch {
    /* sem metricas */
  }
  const extra: Record<string, unknown> = {}
  for (const probe of probes) {
    try {
      Object.assign(extra, probe())
    } catch {
      /* uma sonda quebrada nao cala as outras */
    }
  }
  diagLog('pulso', 'ok', {
    freeMb: Math.round(os.freemem() / 1048576),
    appMb: rssMb,
    ...extra
  })
}

/** Depois do `ready` (usa `screen` e `powerMonitor`). */
export function initDiagLog(): void {
  if (fd !== null) return
  try {
    open()
  } catch {
    fd = null
    return
  }

  diagLog('boot', 'inicio', {
    version: app.getVersion(),
    electron: process.versions.electron,
    os: `${os.platform()} ${os.release()}`,
    ramMb: Math.round(os.totalmem() / 1048576)
  })
  diagLog('boot', 'monitores', { displays: displays() })
  void logGpu()

  app.on('child-process-gone', (_e, d) => {
    diagLog('processo', 'morreu', { type: d.type, reason: d.reason, exitCode: d.exitCode, name: d.name })
  })
  app.on('render-process-gone', (_e, _wc, d) => {
    diagLog('processo', 'renderer morreu', { reason: d.reason, exitCode: d.exitCode })
  })
  // O status lido no boot sai "software" em tudo: o processo da GPU ainda nao
  // subiu. O primeiro aviso dele e o retrato que vale (aceleracao ligada ou
  // nao, em qual GPU).
  let gpuSeen = false
  app.on('gpu-info-update', () => {
    if (gpuSeen) return diagLog('gpu', 'info mudou')
    gpuSeen = true
    diagLog('gpu', 'pronta', app.getGPUFeatureStatus() as unknown as Record<string, unknown>)
    void logGpu()
  })

  screen.on('display-added', () => diagLog('monitor', 'adicionado', { displays: displays() }))
  screen.on('display-removed', () => diagLog('monitor', 'removido', { displays: displays() }))
  screen.on('display-metrics-changed', (_e, d, changed) =>
    diagLog('monitor', 'mudou', { id: d.id, changed, bounds: d.bounds, scale: d.scaleFactor })
  )

  for (const ev of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery'] as const) {
    powerMonitor.on(ev as 'suspend', () => diagLog('energia', ev))
  }

  heartbeat = setInterval(pulse, HEARTBEAT_MS)
}

export function stopDiagLog(): void {
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
  diagLog('boot', 'saindo')
  if (fd !== null) {
    try {
      fs.closeSync(fd)
    } catch {
      /* ja fechado */
    }
  }
  fd = null
}
