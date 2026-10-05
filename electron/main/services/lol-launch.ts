import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * ABRIR O CLIENTE DO LOL.
 *
 * Quem abre o League e o Riot Client (`RiotClientServices.exe`), nao o
 * `LeagueClient.exe` direto: e ele que cuida de login e atualizacao. O caminho
 * dele fica registrado pela propria Riot em
 * `%ProgramData%\Riot Games\RiotClientInstalls.json`, entao funciona com a
 * instalacao em qualquer pasta. Se o arquivo sumiu, tenta os caminhos comuns.
 */

const LAUNCH_ARGS = ['--launch-product=league_of_legends', '--launch-patchline=live']

/** Caminhos do Riot Client dentro do `RiotClientInstalls.json`, na ordem de preferencia. */
export function riotClientPathsFromInstalls(content: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const installs = parsed as Record<string, unknown>
  const paths: string[] = []
  for (const key of ['rc_live', 'rc_default', 'rc_beta']) {
    const value = installs[key]
    if (typeof value === 'string' && value.trim() && !paths.includes(value)) paths.push(value)
  }
  return paths
}

function fallbackRiotClientPaths(): string[] {
  const paths = [
    'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    'D:\\Riot Games\\Riot Client\\RiotClientServices.exe'
  ]
  const programFiles = process.env.ProgramFiles
  if (programFiles) paths.push(path.join(programFiles, 'Riot Games', 'Riot Client', 'RiotClientServices.exe'))
  return paths
}

async function findRiotClient(): Promise<string | null> {
  const candidates: string[] = []
  const programData = process.env.ProgramData ?? 'C:\\ProgramData'
  try {
    const content = await fs.readFile(path.join(programData, 'Riot Games', 'RiotClientInstalls.json'), 'utf-8')
    candidates.push(...riotClientPathsFromInstalls(content))
  } catch {
    // Sem o registro da Riot. Segue pros caminhos comuns.
  }
  candidates.push(...fallbackRiotClientPaths())

  for (const file of candidates) {
    try {
      await fs.access(file)
      return file
    } catch {
      // Nao existe. Proximo.
    }
  }
  return null
}

export interface LolLaunchResult {
  ok: boolean
  error?: string
}

export async function launchLolClient(): Promise<LolLaunchResult> {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Abrir o LoL so funciona no Windows' }
  }
  const exe = await findRiotClient()
  if (!exe) return { ok: false, error: 'Nao achei o League of Legends instalado nesta maquina' }

  return new Promise((resolve) => {
    // Solto do launcher: fechar o launcher nao pode derrubar o jogo.
    const child = spawn(exe, LAUNCH_ARGS, { detached: true, stdio: 'ignore', cwd: path.dirname(exe) })
    child.once('error', (err) => resolve({ ok: false, error: `Nao consegui abrir o LoL: ${err.message}` }))
    child.once('spawn', () => {
      child.unref()
      resolve({ ok: true })
    })
  })
}
