import { spawn } from 'node:child_process'
import { buildInstallArgs, powershellPath } from './lingua-voice-args.js'

/**
 * Instala a voz de leitura (TTS) de uma língua no Windows. Pede UAC (o
 * Add-WindowsCapability exige admin). Depois de instalada o app precisa
 * reiniciar pra o Chromium enxergar a voz nova — por isso `restartNeeded`.
 */
export function installVoice(lang: string): Promise<{ ok: boolean; error?: string; restartNeeded?: boolean }> {
  const args = buildInstallArgs(lang)
  if (!args) return Promise.resolve({ ok: false, error: 'invalid_lang' })
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, error: 'unsupported' })

  return new Promise((resolve) => {
    const child = spawn(powershellPath(), args, { windowsHide: true, stdio: 'ignore' })
    child.once('error', (err) => resolve({ ok: false, error: err.message }))
    child.once('exit', (code) =>
      resolve(code === 0 ? { ok: true, restartNeeded: true } : { ok: false, error: `exit_${code ?? 'null'}` })
    )
  })
}
