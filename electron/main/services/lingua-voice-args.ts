/**
 * Língua Murcha — montagem (pura) do comando que instala a voz do Windows.
 * Separado de lingua-voice.ts pra poder ser testado sem Electron/child_process.
 */

/** Código da língua (API) -> BCP47 da voz do Windows. Espelha VOICE_LANG do renderer. */
export const VOICE_BCP47: Readonly<Record<string, string>> = {
  en: 'en-US',
  ja: 'ja-JP',
  fr: 'fr-FR',
  it: 'it-IT',
  es: 'es-ES',
  de: 'de-DE',
  zh: 'zh-CN'
}

const ALLOWED_BCP47 = new Set(Object.values(VOICE_BCP47))

/** PowerShell por caminho absoluto (não depende do PATH). */
export function powershellPath(): string {
  const root = process.env.SystemRoot ?? 'C:\\Windows'
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/** Nome da capability do Windows pra voz. null se o BCP47 não é um dos 7. */
export function voiceCapabilityName(bcp47: string): string | null {
  if (!ALLOWED_BCP47.has(bcp47)) return null
  return `Language.TextToSpeech~~~${bcp47}~0.0.1.0`
}

/** Argumentos do `powershell` externo (eleva via UAC e espera). null se a língua não é uma das 7. */
export function buildInstallArgs(lang: string): string[] | null {
  const bcp47 = Object.hasOwn(VOICE_BCP47, lang) ? VOICE_BCP47[lang] : lang
  const name = voiceCapabilityName(bcp47)
  if (!name) return null
  // Start-Process -Wait não propaga o exit code do processo elevado: -PassThru
  // + `exit $p.ExitCode`. O interno sai com 1 se a instalação falhar.
  const ps = powershellPath()
  const inner = `-NoProfile -Command try { Add-WindowsCapability -Online -Name ${name} -ErrorAction Stop } catch { exit 1 }`
  return [
    '-NoProfile',
    '-Command',
    // Start-Process falhando (UAC cancelado) deixa $p nulo -> o catch sai com 1.
    `try { $p = Start-Process '${ps}' -Verb RunAs -Wait -PassThru -ErrorAction Stop -ArgumentList '${inner}'; exit $p.ExitCode } catch { exit 1 }`
  ]
}
