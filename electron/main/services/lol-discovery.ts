import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * ACHAR O CLIENTE DO LOL: porta e senha da API local (LCU).
 *
 * A senha muda a cada abertura do cliente, entao nao da pra guardar nada; tem
 * que descobrir toda vez. Tres fontes, nesta ordem:
 *
 *   1. lockfile que a pessoa apontou nas configuracoes (quando o automatico
 *      falha, ela manda o caminho e pronto);
 *   2. linha de comando do processo `LeagueClientUx.exe`, que carrega
 *      `--app-port=` e `--remoting-auth-token=`. Funciona com o LoL instalado
 *      em qualquer pasta, por isso vem antes dos caminhos chutados;
 *   3. lockfile nos caminhos de instalacao mais comuns.
 *
 * Antes do passo 2 tem um filtro barato: `tasklist` pra ver se o processo
 * existe. O launcher mora na bandeja o dia inteiro e a descoberta roda a cada
 * 5s enquanto nao conecta; subir um PowerShell a cada 5s pra descobrir que o
 * LoL esta fechado custaria meio segundo de CPU o dia todo. `tasklist` custa
 * uns 40ms.
 *
 * Um lockfile pode ficar pra tras quando o cliente cai sem limpar. Por isso o
 * PID que vem nele e conferido antes de usar: processo morto = arquivo velho.
 */

export type LcuSource = 'lockfile-manual' | 'process' | 'lockfile'

export interface LcuCredentials {
  port: number
  password: string
  /** PID do LeagueClient.exe, quando veio do lockfile. */
  pid?: number
  source: LcuSource
  /** Caminho do lockfile ou nome do processo — pra log e diagnostico. */
  origin: string
}

export interface DiscoveryOutcome {
  credentials: LcuCredentials | null
  /** Algo que vale mostrar na tela de configuracoes (lockfile manual invalido, PowerShell quebrado). */
  error?: string
}

const UX_PROCESS = 'LeagueClientUx.exe'
const POWERSHELL_TIMEOUT_MS = 4_000
const TASKLIST_TIMEOUT_MS = 3_000

function fallbackLockfilePaths(): string[] {
  const paths = [
    'C:\\Riot Games\\League of Legends\\lockfile',
    'D:\\Riot Games\\League of Legends\\lockfile'
  ]
  const programFiles = process.env.ProgramFiles
  if (programFiles) paths.push(path.join(programFiles, 'Riot Games', 'League of Legends', 'lockfile'))
  return paths
}

function runCapture(file: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout)
      }
    )
  })
}

/** `LeagueClient:PID:PORT:PASSWORD:https` */
export function parseLockfile(content: string): { pid?: number; port: number; password: string } | null {
  const parts = content.trim().split(':')
  if (parts.length < 5) return null
  const port = Number(parts[2])
  const password = parts[3]
  if (!Number.isInteger(port) || port <= 0 || port > 65535 || !password) return null
  const pid = Number(parts[1])
  return { pid: Number.isInteger(pid) && pid > 0 ? pid : undefined, port, password }
}

/** Linha de comando do LeagueClientUx.exe: `... "--app-port=1234" "--remoting-auth-token=abc" ...` */
export function parseCommandLine(cmdline: string): { port: number; password: string } | null {
  const port = /--app-port=(\d+)/.exec(cmdline)?.[1]
  const token = /--remoting-auth-token=([^\s"']+)/.exec(cmdline)?.[1]
  if (!port || !token) return null
  const p = Number(port)
  if (!Number.isInteger(p) || p <= 0 || p > 65535) return null
  return { port: p, password: token }
}

/**
 * Sinal 0 nao mata nada, so pergunta se o processo existe. EPERM quer dizer
 * "existe mas nao e seu" — pra gente, existe.
 */
function pidAlive(pid: number | undefined): boolean {
  if (!pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Aceita tanto o arquivo quanto a pasta de instalacao: quem cola o caminho
 * nas configuracoes geralmente cola a pasta.
 */
function resolveLockfilePath(configured: string): string {
  const trimmed = configured.trim().replace(/^"|"$/g, '')
  return path.basename(trimmed).toLowerCase() === 'lockfile' ? trimmed : path.join(trimmed, 'lockfile')
}

async function fromLockfile(file: string, source: LcuSource): Promise<LcuCredentials | 'stale' | null> {
  const content = await fs.readFile(file, 'utf-8')
  const parsed = parseLockfile(content)
  if (!parsed) return null
  if (!pidAlive(parsed.pid)) return 'stale'
  return { ...parsed, source, origin: file }
}

/** null = nao deu pra saber (tasklist falhou); segue como se estivesse rodando. */
async function isUxRunning(): Promise<boolean | null> {
  try {
    const out = await runCapture(
      'tasklist',
      ['/FI', `IMAGENAME eq ${UX_PROCESS}`, '/NH', '/FO', 'CSV'],
      TASKLIST_TIMEOUT_MS
    )
    // A mensagem de "nenhuma tarefa" e traduzida conforme o Windows; o nome do
    // processo na linha CSV nao. Procurar o nome funciona em qualquer idioma.
    return out.toLowerCase().includes(UX_PROCESS.toLowerCase())
  } catch {
    return null
  }
}

/**
 * Linhas de comando de todos os processos com esse nome.
 *
 * `-EncodedCommand` em vez de `-Command`: o script tem aspas simples e duplas
 * misturadas, e cada camada (Node, CreateProcess, PowerShell) tem regra
 * propria de escape. Base64 atravessa todas sem drama.
 */
export async function readProcessCommandLines(processName: string): Promise<string[]> {
  const script = `Get-CimInstance Win32_Process -Filter "Name='${processName}'" | Select-Object -ExpandProperty CommandLine`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  const out = await runCapture(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    POWERSHELL_TIMEOUT_MS
  )
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

async function fromProcess(): Promise<LcuCredentials | null> {
  for (const line of await readProcessCommandLines(UX_PROCESS)) {
    const parsed = parseCommandLine(line)
    if (parsed) return { ...parsed, source: 'process', origin: UX_PROCESS }
  }
  return null
}

export async function discoverLcu(manualLockfilePath: string): Promise<DiscoveryOutcome> {
  if (process.platform !== 'win32') {
    return { credentials: null, error: 'A leitura do cliente do LoL so funciona no Windows' }
  }

  let error: string | undefined

  // 1. Caminho manual: vem antes do filtro de processo porque e a saida de
  //    quem esta com a deteccao automatica quebrada — inclusive o tasklist.
  if (manualLockfilePath.trim()) {
    const file = resolveLockfilePath(manualLockfilePath)
    try {
      const found = await fromLockfile(file, 'lockfile-manual')
      if (found && found !== 'stale') return { credentials: found }
      if (found === null) error = `O lockfile em ${file} nao tem o formato esperado`
      // 'stale': cliente fechado, arquivo ficou. Normal, sem erro.
    } catch {
      error = `Nao consegui ler o lockfile em ${file}`
    }
  }

  // 2. Filtro barato antes do PowerShell.
  const running = await isUxRunning()
  if (running === false) return { credentials: null, error }

  // 3. Linha de comando do processo.
  try {
    const found = await fromProcess()
    if (found) return { credentials: found, error }
  } catch (err) {
    error ??= `PowerShell falhou ao ler o processo do cliente: ${(err as Error).message}`
  }

  // 4. Caminhos de instalacao comuns.
  for (const file of fallbackLockfilePaths()) {
    try {
      const found = await fromLockfile(file, 'lockfile')
      if (found && found !== 'stale') return { credentials: found, error }
    } catch {
      // Nao existe nessa pasta. Segue.
    }
  }

  if (running === true) {
    error ??= `${UX_PROCESS} esta aberto, mas nao achei porta e senha. Informe o caminho do lockfile nas configuracoes.`
  }
  return { credentials: null, error }
}
