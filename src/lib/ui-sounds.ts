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
 * Entrar e sair da call (`voice-join`/`voice-leave`) TAMBÉM são sintetizados.
 * Já foram dois mp3, e o veredito de quem usa foi "horrível": som de arquivo
 * tem timbre próprio, então ele não pertencia à família dos outros avisos, e
 * era o aviso que mais toca numa noite — cada pessoa que entra ou sai. Agora
 * são as notas mais curtas e discretas do conjunto (ver ENTER/LEAVE abaixo).
 */

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
  /**
   * Alguém entrou ou saiu da call. É o aviso que mais toca numa noite, então é
   * o mais curto e o mais discreto do conjunto: DUAS NOTAS DE 45ms, seno puro
   * (sem o brilho da triangular), passa-baixa em 1400 Hz e volume 0.32 — perto
   * de um "tô" em vez de uma fanfarra. O intervalo é uma quarta, que não soa
   * nem alegre nem triste; só marca que algo mudou.
   *
   * O volume (0.45, igual ao de `user-join`) e o teto do slider proprio nas
   * configuracoes de chat sao o que resolve a reclamacao: o mp3 antigo tocava
   * com o ganho do slider DIRETO, sem o fator 0.22 dos sintetizados, e saia
   * umas dez vezes mais alto que qualquer outro aviso do app.
   */
  'voice-join': {
    volume: 0.45,
    cutoff: 1400,
    type: 'sine',
    notes: [
      { freq: A4, at: 0, dur: 0.045, gain: 0.7 },
      { freq: D5, at: 0.05, dur: 0.075 }
    ]
  },
  'voice-leave': {
    volume: 0.45,
    cutoff: 1400,
    type: 'sine',
    notes: [
      { freq: D5, at: 0, dur: 0.045, gain: 0.7 },
      { freq: A4, at: 0.05, dur: 0.09 }
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
 * SONS DA LOJINHA — cosmético `joinSound` (`sound:<chave>`). Cada um é um par
 * entrar/sair; todo mundo no canal ouve o par DE QUEM entrou ou saiu. Mesmo
 * sintetizador dos avisos (Cue), só que aqui o timbre pode variar: a graça
 * é justamente cada pessoa soar diferente. Duração curta mesmo assim — é o
 * aviso que mais toca numa noite.
 */
export const JOIN_SOUNDS: Record<string, { join: Cue; leave: Cue }> = {
  // raros
  retro: {
    join: { volume: 0.5, cutoff: 3200, type: 'square', notes: [{ freq: C5, at: 0, dur: 0.06 }, { freq: E5, at: 0.06, dur: 0.06 }, { freq: G5, at: 0.12, dur: 0.1 }] },
    leave: { volume: 0.5, cutoff: 3200, type: 'square', notes: [{ freq: G5, at: 0, dur: 0.06 }, { freq: E5, at: 0.06, dur: 0.06 }, { freq: C5, at: 0.12, dur: 0.12 }] }
  },
  bell: {
    join: { volume: 0.55, cutoff: 5000, type: 'sine', notes: [{ freq: E6, at: 0, dur: 0.5 }, { freq: E6 * 2.76, at: 0, dur: 0.18, gain: 0.25 }] },
    leave: { volume: 0.55, cutoff: 5000, type: 'sine', notes: [{ freq: B5, at: 0, dur: 0.5 }, { freq: B5 * 2.76, at: 0, dur: 0.18, gain: 0.25 }] }
  },
  woosh: {
    join: { volume: 0.6, cutoff: 1200, type: 'sawtooth', notes: [{ freq: 90, at: 0, dur: 0.12, gain: 0.5 }, { freq: 220, at: 0.06, dur: 0.16 }, { freq: 480, at: 0.14, dur: 0.14, gain: 0.6 }] },
    leave: { volume: 0.6, cutoff: 1200, type: 'sawtooth', notes: [{ freq: 480, at: 0, dur: 0.12, gain: 0.6 }, { freq: 220, at: 0.06, dur: 0.16 }, { freq: 90, at: 0.14, dur: 0.18, gain: 0.5 }] }
  },
  pop: {
    join: { volume: 0.7, cutoff: 2400, type: 'sine', notes: [{ freq: 320, at: 0, dur: 0.05 }, { freq: 640, at: 0.02, dur: 0.06 }] },
    leave: { volume: 0.7, cutoff: 2400, type: 'sine', notes: [{ freq: 640, at: 0, dur: 0.05 }, { freq: 320, at: 0.02, dur: 0.07 }] }
  },
  radio: {
    join: { volume: 0.45, cutoff: 1800, type: 'square', notes: [{ freq: 1900, at: 0, dur: 0.04, gain: 0.5 }, { freq: 2300, at: 0.05, dur: 0.04, gain: 0.5 }, { freq: A5, at: 0.11, dur: 0.12 }] },
    leave: { volume: 0.45, cutoff: 1800, type: 'square', notes: [{ freq: A5, at: 0, dur: 0.1 }, { freq: 2300, at: 0.11, dur: 0.04, gain: 0.5 }, { freq: 1900, at: 0.16, dur: 0.05, gain: 0.5 }] }
  },
  // épicos
  thunder: {
    join: { volume: 0.9, cutoff: 500, type: 'sawtooth', notes: [{ freq: 55, at: 0, dur: 0.4 }, { freq: 41, at: 0.08, dur: 0.5, gain: 0.8 }, { freq: 65, at: 0.02, dur: 0.15, gain: 0.5 }] },
    leave: { volume: 0.9, cutoff: 400, type: 'sawtooth', notes: [{ freq: 65, at: 0, dur: 0.2 }, { freq: 41, at: 0.1, dur: 0.6, gain: 0.7 }] }
  },
  laser: {
    // entrar sobe, sair desce — igual aos outros pares
    join: { volume: 0.55, cutoff: 4000, type: 'sawtooth', notes: [{ freq: 400, at: 0, dur: 0.05 }, { freq: 700, at: 0.04, dur: 0.05 }, { freq: 1200, at: 0.08, dur: 0.06 }, { freq: 1800, at: 0.12, dur: 0.1 }] },
    leave: { volume: 0.55, cutoff: 4000, type: 'sawtooth', notes: [{ freq: 1800, at: 0, dur: 0.05 }, { freq: 1200, at: 0.04, dur: 0.05 }, { freq: 700, at: 0.08, dur: 0.06 }, { freq: 400, at: 0.12, dur: 0.1 }] }
  },
  choir: {
    join: { volume: 0.5, cutoff: 2000, type: 'triangle', notes: [{ freq: C5, at: 0, dur: 0.7 }, { freq: E5, at: 0.05, dur: 0.65 }, { freq: G5, at: 0.1, dur: 0.6 }, { freq: C6, at: 0.15, dur: 0.55, gain: 0.7 }] },
    leave: { volume: 0.5, cutoff: 2000, type: 'triangle', notes: [{ freq: C5, at: 0, dur: 0.7 }, { freq: 311.13, at: 0.05, dur: 0.65 }, { freq: G5, at: 0.1, dur: 0.6, gain: 0.7 }] }
  },
  // lendário
  royal: {
    join: { volume: 0.8, cutoff: 2600, type: 'sawtooth', notes: [{ freq: G4, at: 0, dur: 0.1 }, { freq: G4, at: 0.12, dur: 0.1 }, { freq: C5, at: 0.24, dur: 0.14 }, { freq: E5, at: 0.36, dur: 0.14 }, { freq: G5, at: 0.48, dur: 0.4 }, { freq: C5, at: 0.48, dur: 0.4, gain: 0.5 }] },
    leave: { volume: 0.8, cutoff: 2600, type: 'sawtooth', notes: [{ freq: G5, at: 0, dur: 0.12 }, { freq: E5, at: 0.12, dur: 0.12 }, { freq: C5, at: 0.24, dur: 0.14 }, { freq: G4, at: 0.36, dur: 0.4 }, { freq: C5 / 2, at: 0.36, dur: 0.4, gain: 0.5 }] }
  }
}

export const JOIN_SOUND_KEYS = Object.keys(JOIN_SOUNDS)

/**
 * Toca o som de entrar/sair de um cosmético. Aceita o id completo
 * (`sound:bell`) ou só a chave. Devolve false se a chave é desconhecida ou o
 * volume é zero — aí quem chamou toca o aviso padrão.
 */
export function playJoinSound(sound: string | null | undefined, phase: 'join' | 'leave', volume: number): boolean {
  if (!sound || volume <= 0) return false
  const key = sound.startsWith('sound:') ? sound.slice('sound:'.length) : sound
  const pair = JOIN_SOUNDS[key]
  if (!pair) return false

  const audio = audioContext()
  if (!audio) return false
  if (audio.state === 'suspended') void audio.resume().catch(() => {})

  playSynth(audio, pair[phase], volume)
  return true
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
