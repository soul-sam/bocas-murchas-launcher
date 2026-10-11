import { app, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * SOM DO SISTEMA SEM O LAUNCHER — o lado main.
 *
 * O `audio: 'loopback'` do Electron entrega a mistura final da placa de som,
 * com tudo que o proprio launcher toca dentro: quem transmitia a tela com som
 * devolvia pra call as vozes da call. Aqui a captura e feita pelo
 * bm-loopback.exe (native/process-loopback), que usa a captura por processo
 * do Windows excluindo UM processo e os filhos dele.
 *
 * QUAL processo excluir importa:
 *  - NAO o main. Minecraft e o cliente do LoL nascem como filhos do launcher
 *    (services/launcher.ts, services/lol-launch.ts); excluir a arvore do main
 *    tiraria o som do jogo da transmissao — justamente o som que se quer levar.
 *  - SIM o AudioService do Chromium. No Windows ele roda num processo
 *    utilitario proprio e e o UNICO lugar onde o launcher toca som: vozes da
 *    call, soundboard, avisos, musica, <video>. Ele nao tem filhos.
 *
 * O AudioService pode nascer depois (ninguem tocou nada ainda) ou renascer
 * (crash). Por isso o PID e conferido de tempos em tempos e o helper e
 * relancado se mudar. Sem AudioService, cai na arvore do main — melhor perder
 * o som de um jogo aberto pelo launcher do que ecoar a call.
 *
 * O audio sai do helper como float32 estereo intercalado e vai pro renderer
 * por IPC (`screen:loopback-pcm`), em pedacos de ~10 ms.
 */

const PID_CHECK_MS = 2000
const READY_TIMEOUT_MS = 4000

interface Session {
  target: WebContents
  sampleRate: number
  child: ChildProcess | null
  excludedPid: number
  timer: NodeJS.Timeout | null
  stopped: boolean
}

let current: Session | null = null

function helperPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bm-loopback.exe')
    : path.join(app.getAppPath(), 'build/bin/bm-loopback.exe')
}

/** PID do processo que toca TODO o som do launcher. */
function audioServicePid(): number | null {
  const metric = app
    .getAppMetrics()
    .find(
      (m) =>
        m.type === 'Utility' &&
        (m.serviceName === 'audio.mojom.AudioService' || /audio/i.test(m.name ?? ''))
    )
  return metric?.pid ?? null
}

function excludedPid(): number {
  return audioServicePid() ?? process.pid
}

/** Captura por processo existe a partir do Windows 10 2004 (build 19041). */
export function isProcessLoopbackSupported(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(process.getSystemVersion().split('.')[2] ?? 0)
  return build >= 19041 && existsSync(helperPath())
}

function spawnHelper(session: Session, pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), [String(pid), String(session.sampleRate)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    session.child = child
    session.excludedPid = pid

    let settled = false
    let stderr = ''
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('captura de som nao respondeu'))
    }, READY_TIMEOUT_MS)

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (!settled && stderr.includes('ready')) {
        settled = true
        clearTimeout(timeout)
        resolve()
      }
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      if (session.stopped || session.child !== child) return
      if (session.target.isDestroyed()) {
        stopProcessLoopback()
        return
      }
      session.target.send('screen:loopback-pcm', chunk)
    })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(stderr.trim() || `captura de som saiu (${code})`))
        return
      }
      // Morreu sozinho no meio da transmissao (nao foi troca de PID nem stop).
      if (session.child === child && !session.stopped) {
        console.warn('[loopback] helper saiu no meio:', code, stderr.trim())
        session.child = null
      }
    })
  })
}

function killChild(child: ChildProcess | null): void {
  if (!child) return
  // Fechar o stdin e o jeito educado (o helper sai sozinho); o kill e a garantia.
  child.stdin?.end()
  setTimeout(() => {
    if (child.exitCode === null) child.kill()
  }, 500)
}

/**
 * Liga a captura e passa a mandar o PCM pro `target`. Uma por vez: chamar de
 * novo substitui a anterior.
 */
export async function startProcessLoopback(
  target: WebContents,
  sampleRate: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  stopProcessLoopback()
  if (!isProcessLoopbackSupported()) return { ok: false, error: 'nao suportado' }

  const session: Session = {
    target,
    sampleRate,
    child: null,
    excludedPid: 0,
    timer: null,
    stopped: false
  }
  current = session

  try {
    await spawnHelper(session, excludedPid())
  } catch (err) {
    if (current === session) current = null
    session.stopped = true
    killChild(session.child)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  console.log('[loopback] capturando sem o pid', session.excludedPid)

  session.timer = setInterval(() => {
    if (session.stopped) return
    const pid = excludedPid()
    const alive = session.child !== null && session.child.exitCode === null
    if (pid === session.excludedPid && alive) return
    // AudioService nasceu, renasceu, ou o helper caiu: relanca.
    const old = session.child
    session.child = null
    killChild(old)
    spawnHelper(session, pid)
      .then(() => console.log('[loopback] relancado sem o pid', pid))
      .catch((err) => console.warn('[loopback] falha ao relancar', err))
  }, PID_CHECK_MS)

  target.once('destroyed', () => {
    if (current === session) stopProcessLoopback()
  })

  return { ok: true }
}

export function stopProcessLoopback(): void {
  const session = current
  if (!session) return
  current = null
  session.stopped = true
  if (session.timer) clearInterval(session.timer)
  killChild(session.child)
  session.child = null
}
