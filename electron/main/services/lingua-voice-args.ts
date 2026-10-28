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

/**
 * Script que roda na janela ELEVADA. Ela fica visível de propósito: baixar a
 * voz do Windows Update leva minutos e, muda, a janela parece travada — e
 * fechá-la mata a instalação no meio (exit 0xC000013A). Então ela diz o que
 * está fazendo, pula se a voz já está lá, e no fim mostra o resultado antes
 * de fechar sozinha.
 */
export function elevatedScript(name: string, bcp47: string): string {
  return [
    "$Host.UI.RawUI.WindowTitle = 'Bocas Murchas - instalando voz'",
    `Write-Host 'Bocas Murchas: instalando a voz ${bcp47} do Windows.' -ForegroundColor Green`,
    "Write-Host 'Baixando do Windows Update. Pode levar de 2 a 10 minutos.'",
    "Write-Host 'NAO FECHE ESTA JANELA. Ela fecha sozinha quando terminar.' -ForegroundColor Yellow",
    "Write-Host ''",
    'try {',
    `  $cap = Get-WindowsCapability -Online -Name '${name}' -ErrorAction Stop`,
    "  if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name -ErrorAction Stop | Out-Null }",
    "  Write-Host 'Pronto! Voz instalada.' -ForegroundColor Green",
    '  Start-Sleep -Seconds 3',
    '  exit 0',
    '} catch {',
    "  Write-Host ('Falhou: ' + $_.Exception.Message) -ForegroundColor Red",
    "  Write-Host 'Esta janela fecha em 20 segundos.'",
    '  Start-Sleep -Seconds 20',
    '  exit 1',
    '}'
  ].join('\n')
}

/** -EncodedCommand: base64 de UTF-16LE. Sem aspas pra escapar no caminho. */
export function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Argumentos do `powershell` externo (eleva via UAC e espera). null se a língua não é uma das 7. */
export function buildInstallArgs(lang: string): string[] | null {
  const bcp47 = Object.hasOwn(VOICE_BCP47, lang) ? VOICE_BCP47[lang] : lang
  const name = voiceCapabilityName(bcp47)
  if (!name) return null
  // Start-Process -Wait não propaga o exit code do processo elevado: -PassThru
  // + `exit $p.ExitCode`. O interno sai com 1 se a instalação falhar.
  const ps = powershellPath()
  const inner = `-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodeCommand(elevatedScript(name, bcp47))}`
  return [
    '-NoProfile',
    '-Command',
    // Start-Process falhando (UAC cancelado) deixa $p nulo -> o catch sai com 1.
    `try { $p = Start-Process '${ps}' -Verb RunAs -Wait -PassThru -ErrorAction Stop -ArgumentList '${inner}'; exit $p.ExitCode } catch { exit 1 }`
  ]
}

/** Exit code do processo elevado -> código de erro pra tela. */
export function installErrorCode(code: number | null): string {
  // 0xC000013A (STATUS_CONTROL_C_EXIT): a janela foi fechada no meio.
  if (code === 3221225786 || code === -1073741510) return 'window_closed'
  return `exit_${code ?? 'null'}`
}
