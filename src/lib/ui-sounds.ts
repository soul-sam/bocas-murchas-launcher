/**
 * Sons da interface (entrar na call, mutar, alguém chegou…).
 *
 * A maioria é SINTETIZADA no Web Audio, não arquivo. Três motivos: não pesam
 * no instalador, não dependem de asset que pode faltar no pacote (o hook
 * antigo de mp3 já falhava calado por isso), e não carregam licença de
 * terceiros — são nossos.
 *
 * O timbre é o mesmo em todos os avisos: duas ondas triangulares levemente
 * desafinadas entre si passando por um filtro passa-baixa. A desafinação dá
 * corpo (uma onda pura soa fina e digital) e o filtro tira o brilho áspero.
 * O que muda de um aviso pro outro é só a melodia — assim o conjunto soa como
 * uma família, e não como sons avulsos.
 *
 * Exceção: alguém entrar ou sair da call (`voice-join`/`voice-leave`) usa
 * dois mp3 escolhidos pela galera (`assets/sounds`). Pra não repetir a falha
 * antiga, eles entram no bundle como data URI (ver assetsInlineLimit no
 * electron.vite.config.ts) e tocam pelo mesmo AudioContext dos outros
 * avisos. O `volume` recebido vira o ganho direto (sem o fator 0.22 dos
 * sintetizados), controlado pelo slider próprio nas configurações de chat.
 */

import voiceJoinUrl from '@/assets/sounds/voice-join.mp3'
import voiceLeaveUrl from '@/assets/sounds/voice-leave.mp3'

export type UiSound =
  | 'voice-join'
  | 'voice-leave'
  | 'self-join'
  | 'self-leave'
  | 'user-join'
  | 'user-leave'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'nudge'
  | 'message'
  | 'mention'
  | 'xp'
  | 'levelup'
  | 'coins'

interface Note {
  /** Frequência em Hz. */
  freq: number
  /** Atraso do início, em segundos, contado do disparo. */
  at: number
  /** Duração da nota em segundos. */
  dur: number
  /** Ganho relativo (0..1) antes do volume do usuário. */
  gain?: number
}

interface Cue {
  notes: Note[]
  /** Multiplicador geral do aviso — avisos dos outros são mais discretos. */
  volume: number
  /** Corte do passa-baixa. Mais baixo = mais abafado. */
  cutoff?: number
  type?: OscillatorType
}

// Frequências (temperamento igual, A4 = 440).
const A4 = 440
const C5 = 523.25
const D5 = 587.33
const E5 = 659.25
const A5 = 880
const B5 = 987.77
const G4 = 392
const E4 = 329.63
const G5 = 783.99
const C6 = 1046.5
const E6 = 1318.51

/**
 * Vocabulário: subir = algo começou/abriu, descer = algo terminou/fechou.
 * É a mesma convenção do Discord e do TeamSpeak — a galera já chega sabendo
 * ler, sem precisar decorar nada.
 */
const CUES: Record<UiSound, Cue> = {
  // Entrar/sair da call vêm de arquivo (FILE_CUES); isto é só o reserva pra
  // quando o mp3 não decodifica.
  'voice-join': {
    volume: 0.85,
    notes: [
      { freq: D5, at: 0, dur: 0.11 },
      { freq: A5, at: 0.08, dur: 0.22 }
    ]
  },
  'voice-leave': {
    volume: 0.85,
    notes: [
      { freq: A5, at: 0, dur: 0.11 },
      { freq: D5, at: 0.08, dur: 0.22 }
    ]
  },

  // Você entrou: quinta ascendente, confiante.
  'self-join': {
    volume: 0.85,
    notes: [
      { freq: D5, at: 0, dur: 0.11 },
      { freq: A5, at: 0.08, dur: 0.22 }
    ]
  },

  // Você saiu: a mesma coisa ao contrário.
  'self-leave': {
    volume: 0.85,
    notes: [
      { freq: A5, at: 0, dur: 0.11 },
      { freq: D5, at: 0.08, dur: 0.24 }
    ]
  },

  // Chegou alguém: mais agudo e mais baixo que o seu próprio, pra informar
  // sem roubar a atenção de quem está falando.
  'user-join': {
    volume: 0.45,
    notes: [
      { freq: E5, at: 0, dur: 0.08 },
      { freq: B5, at: 0.06, dur: 0.16 }
    ]
  },

  'user-leave': {
    volume: 0.45,
    notes: [
      { freq: B5, at: 0, dur: 0.08 },
      { freq: E5, at: 0.06, dur: 0.18 }
    ]
  },

  // Mutar/desmutar acontecem o tempo todo: nota única, curta e seca.
  mute: {
    volume: 0.6,
    cutoff: 1600,
    notes: [{ freq: A4, at: 0, dur: 0.1 }]
  },

  unmute: {
    volume: 0.6,
    cutoff: 2600,
    notes: [{ freq: E5, at: 0, dur: 0.1 }]
  },

  // Ensurdecer fecha tudo: desce mais e sai mais abafado, como se tapasse.
  deafen: {
    volume: 0.6,
    cutoff: 900,
    notes: [
      { freq: C5, at: 0, dur: 0.1 },
      { freq: G4, at: 0.07, dur: 0.16 },
      { freq: E4, at: 0.14, dur: 0.2 }
    ]
  },

  undeafen: {
    volume: 0.6,
    cutoff: 2800,
    notes: [
      { freq: E4, at: 0, dur: 0.08 },
      { freq: G4, at: 0.06, dur: 0.1 },
      { freq: C5, at: 0.12, dur: 0.18 }
    ]
  },

  // Mensagem nova: uma nota só, curta e baixa. Toca dezenas de vezes por
  // noite — qualquer coisa mais elaborada vira tortura em duas horas.
  message: {
    volume: 0.3,
    cutoff: 3000,
    notes: [{ freq: C5, at: 0, dur: 0.07 }]
  },

  // Citaram você: duas notas subindo, mais altas que a mensagem comum. É o
  // único aviso do chat com direito a roubar atenção.
  mention: {
    volume: 0.7,
    cutoff: 3200,
    notes: [
      { freq: E5, at: 0, dur: 0.08 },
      { freq: A5, at: 0.07, dur: 0.18 }
    ]
  },

  // Cutucada: baque grave, sem melodia. É pra assustar, não pra agradar.
  nudge: {
    volume: 1,
    cutoff: 700,
    type: 'sine',
    notes: [
      { freq: 180, at: 0, dur: 0.18 },
      { freq: 90, at: 0.05, dur: 0.3 }
    ]
  },

  // Ganhou XP: um blip só, mais agudo que a mensagem pra não confundir os
  // dois. Toca a cada mensagem enviada — por isso é curto, baixo, e o
  // contexto ainda segura pra no máximo um a cada 3s.
  xp: {
    volume: 0.3,
    cutoff: 3400,
    notes: [{ freq: G5, at: 0, dur: 0.06 }]
  },

  // Subiu de nível: arpejo de dó maior subindo até a oitava. É o único aviso
  // da gamificação que tem direito a ser festivo — acontece poucas vezes.
  levelup: {
    volume: 0.9,
    cutoff: 3000,
    notes: [
      { freq: C5, at: 0, dur: 0.1 },
      { freq: E5, at: 0.09, dur: 0.1 },
      { freq: G5, at: 0.18, dur: 0.1 },
      { freq: C6, at: 0.27, dur: 0.32 }
    ]
  },

  // Moedas/badge: duas notas altas e rápidas, o "plim-plim" de moeda de
  // videogame. Agudo de propósito: moeda soa fina.
  coins: {
    volume: 0.55,
    cutoff: 3800,
    notes: [
      { freq: B5, at: 0, dur: 0.07 },
      { freq: E6, at: 0.07, dur: 0.16 }
    ]
  }
}

/**
 * Um AudioContext só, reaproveitado.
 *
 * Criar e fechar um por som (o que a versão anterior do nudge fazia) estoura
 * o limite do Chromium depois de algumas dezenas de avisos e o áudio para de
 * sair sem erro nenhum.
 */
let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

/**
 * Avisos que vêm de arquivo em vez de sintetizados. Entrar e sair da call
 * tocam pra todo mundo que está na sala: quem chega e quem já estava ouvem
 * o mesmo som, idem na saída.
 */
const FILE_CUES: Partial<Record<UiSound, string>> = {
  'voice-join': voiceJoinUrl,
  'voice-leave': voiceLeaveUrl
}

/**
 * Buffers decodificados, um por arquivo. Decodificar a cada toque custa
 * alguns ms e, pior, atrasa o som em relação ao evento; com cache o segundo
 * toque em diante sai na hora.
 */
const bufferCache = new Map<string, Promise<AudioBuffer | null>>()

/**
 * Bytes do asset.
 *
 * No build o mp3 vira data URI (assetsInlineLimit) e `fetch` de data: é
 * barrado pelo CSP do index.html (connect-src não lista `data:`) — foi por
 * isso que em produção o som nunca tocava, enquanto no dev, que serve o
 * arquivo pelo Vite, funcionava. Data URI a gente decodifica na mão; só o
 * caminho de dev passa pelo fetch.
 */
async function readBytes(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',')
    const header = url.slice(0, comma)
    const payload = url.slice(comma + 1)
    const binary = header.endsWith(';base64') ? atob(payload) : decodeURIComponent(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }
  const res = await fetch(url)
  return res.arrayBuffer()
}

function loadBuffer(audio: AudioContext, url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url)
  if (cached) return cached

  const pending = readBytes(url)
    .then((bytes) => audio.decodeAudioData(bytes))
    .catch(() => {
      // Falhou (asset faltando, formato inválido): esquece pra tentar de novo
      // no próximo toque, e o chamador cai no sintetizado.
      bufferCache.delete(url)
      return null
    })

  bufferCache.set(url, pending)
  return pending
}

/**
 * Toca um arquivo no AudioContext compartilhado. `gain` (0..1) é o volume
 * escolhido pela pessoa; o arquivo já vem normalizado, então 1 = o mais alto
 * que ele tem. Devolve false se não deu pra tocar.
 */
async function playFile(audio: AudioContext, url: string, gain: number): Promise<boolean> {
  const buffer = await loadBuffer(audio, url)
  if (!buffer) return false

  try {
    const source = audio.createBufferSource()
    source.buffer = buffer
    const master = audio.createGain()
    master.gain.value = Math.min(1, gain)
    source.connect(master)
    master.connect(audio.destination)
    source.start()
    return true
  } catch {
    return false
  }
}

/**
 * Toca um aviso. `volume` é o do usuário (0..1); 0 ou menos não toca nada.
 */
export function playUiSound(name: UiSound, volume: number): void {
  if (volume <= 0) return

  const cue = CUES[name]
  if (!cue) return

  const audio = audioContext()
  if (!audio) return

  // Depois de um tempo ocioso o contexto pode entrar em suspenso.
  if (audio.state === 'suspended') void audio.resume().catch(() => {})

  const file = FILE_CUES[name]
  if (file) {
    void playFile(audio, file, volume).then((ok) => {
      if (!ok) playSynth(audio, cue, volume)
    })
    return
  }

  playSynth(audio, cue, volume)
}

function playSynth(audio: AudioContext, cue: Cue, volume: number): void {
  const now = audio.currentTime
  const master = audio.createGain()
  master.gain.value = Math.min(1, volume) * cue.volume * 0.22

  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cue.cutoff ?? 2200

  filter.connect(master)
  master.connect(audio.destination)

  for (const note of cue.notes) {
    const start = now + note.at
    const end = start + note.dur

    const envelope = audio.createGain()
    // Ataque de 8ms: instantâneo demais estala, lento demais soa mole.
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(note.gain ?? 1, start + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)
    envelope.connect(filter)

    // Duas vozes com ±6 cents de diferença: batimento lento que dá calor.
    for (const detune of [-6, 6]) {
      const osc = audio.createOscillator()
      osc.type = cue.type ?? 'triangle'
      osc.frequency.setValueAtTime(note.freq, start)
      osc.detune.setValueAtTime(detune, start)
      osc.connect(envelope)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  }
}
