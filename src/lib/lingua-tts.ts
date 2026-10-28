import type { Lang } from './api-lingua'

/** Língua (API) -> BCP47 da voz do sistema. */
export const VOICE_LANG: Record<Lang, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  fr: 'fr-FR',
  it: 'it-IT',
  es: 'es-ES',
  de: 'de-DE',
  zh: 'zh-CN'
}

interface VoiceLike {
  lang: string
  name: string
}

const NICE = /natural|online/i

/**
 * Escolhe a voz da língua: casa o BCP47 exato; senão o prefixo (`ja`).
 * Entre as candidatas prefere Natural/Online. Sem nenhuma, null.
 */
export function pickVoice<T extends VoiceLike>(voices: T[], lang: Lang): T | null {
  const want = VOICE_LANG[lang].toLowerCase()
  const norm = (v: T) => v.lang.toLowerCase().replace('_', '-')
  const exact = voices.filter((v) => norm(v) === want)
  // zh: o fallback por prefixo não aceita tradicional (zh-TW/zh-HK) — pinyin é simplificado.
  const prefix = voices.filter((v) => {
    const n = norm(v)
    return n.split('-')[0] === lang && !(lang === 'zh' && /hant|-tw|-hk|-mo/.test(n))
  })
  const pool = exact.length ? exact : prefix
  if (!pool.length) return null
  return pool.find((v) => NICE.test(v.name)) ?? pool[0]
}

/** getVoices() é assíncrono no Chromium: espera `voiceschanged` (com limite). */
let cached: SpeechSynthesisVoice[] | null = null
let invalidatorInstalled = false

function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  if (!invalidatorInstalled) {
    invalidatorInstalled = true
    speechSynthesis.addEventListener('voiceschanged', () => {
      cached = null
    })
  }
  if (cached) return Promise.resolve(cached)
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve((cached = now))
  // (vazio não entra no cache: a voz pode aparecer depois)
  return new Promise((resolve) => {
    const finish = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChange)
      clearTimeout(timer)
      const list = speechSynthesis.getVoices()
      if (list.length) cached = list
      resolve(list)
    }
    // O Electron 33 dispara `voiceschanged` DUAS vezes no primeiro getVoices():
    // a primeira com a lista vazia, a segunda (~2 ms depois) com as vozes.
    // Aceitar a primeira dava "sem voz" sempre no 1º clique após abrir o app —
    // e pedia pra instalar de novo a voz que já estava instalada.
    const onChange = () => {
      if (speechSynthesis.getVoices().length) finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    speechSynthesis.addEventListener('voiceschanged', onChange)
  })
}

export async function hasVoice(lang: Lang): Promise<boolean> {
  return pickVoice(await loadVoices(), lang) !== null
}

/**
 * Fala `text` na voz da língua; resolve ao terminar. Sem voz: resolve sem falar.
 * `stillWanted`: conferido depois de carregar as vozes — se a tela já saiu ou
 * a pergunta já mudou, não fala.
 */
export async function speak(text: string, lang: Lang, stillWanted?: () => boolean): Promise<void> {
  const voice = pickVoice(await loadVoices(), lang)
  if (!voice) return
  if (stillWanted && !stillWanted()) return
  speechSynthesis.cancel()
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    // O Chromium às vezes nunca dispara onend: sempre resolve.
    const timer = setTimeout(() => {
      speechSynthesis.cancel()
      resolve()
    }, Math.max(4000, text.length * 150))
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    u.onend = finish
    u.onerror = finish
    speechSynthesis.speak(u)
  })
}
