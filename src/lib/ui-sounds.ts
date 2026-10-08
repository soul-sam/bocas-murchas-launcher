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

import { isLauncherSilenced } from './launcher-silence'

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
  /** Pôquer: sua vez, cartas dadas, fichas na mesa, pote levado. */
  | 'poker-turn'
  | 'poker-deal'
  | 'poker-chip'
  | 'poker-win'
  /**
   * Pôquer, o baralho: a carta saindo da mão do crupiê, a carta virando e o
   * embaralhar. São RUÍDO filtrado (papel), não nota — ver NOISE_CUES.
   */
  | 'poker-card'
  | 'poker-flip'
  | 'poker-shuffle'
  /**
   * Xadrez e dama, no vocabulário do chess.com: o meu lance e o do outro
   * (timbres diferentes), captura, roque, xeque, promoção, pré-lance
   * marcado, começo e fim da partida, pouco tempo e lance proibido.
   */
  | 'board-move'
  | 'board-move-opp'
  | 'board-capture'
  | 'board-castle'
  | 'board-check'
  | 'board-promote'
  | 'board-premove'
  | 'board-start'
  | 'board-end'
  | 'board-low-time'
  | 'board-illegal'
  | 'pool-cue'
  | 'pool-hit'
  | 'pool-cushion'
  | 'pool-pocket'
  | 'pool-nice'
  | 'pool-foul'

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
/** Os de papel (cartas) moram em NOISE_CUES; aqui só os de nota. */
const CUES: Partial<Record<UiSound, Cue>> = {
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
  },

  // PÔQUER. Sua vez: duas notas iguais, secas, como quem bate na mesa — tem
  // que chamar atenção com a janela atrás do jogo, sem assustar.
  'poker-turn': {
    volume: 0.7,
    cutoff: 2600,
    notes: [
      { freq: E5, at: 0, dur: 0.07 },
      { freq: E5, at: 0.12, dur: 0.1 }
    ]
  },
  // Cartas dadas: um toque só, baixo. Toca toda mão; precisa ser quase nada.
  'poker-deal': {
    volume: 0.35,
    cutoff: 1800,
    type: 'sine',
    notes: [{ freq: A4, at: 0, dur: 0.05 }]
  },
  // Fichas na mesa (aposta/aumento de alguém): dois estalos secos e graves,
  // ficha batendo em ficha. Toca a cada aposta dos outros; é quase nada.
  'poker-chip': {
    volume: 0.3,
    cutoff: 2200,
    type: 'triangle',
    notes: [
      { freq: 1046.5, at: 0, dur: 0.03 },
      { freq: 880, at: 0.045, dur: 0.04, gain: 0.7 }
    ]
  },
  // Pote levado: arpejo subindo, parente do `levelup` mas mais curto.
  'poker-win': {
    volume: 0.7,
    cutoff: 3600,
    notes: [
      { freq: C5, at: 0, dur: 0.08 },
      { freq: E5, at: 0.07, dur: 0.08 },
      { freq: G5, at: 0.14, dur: 0.1 },
      { freq: C6, at: 0.21, dur: 0.2 }
    ]
  },
  // Xadrez e dama: a peça pousando na casa — um toque curto e grave, madeira
  // em madeira. Toca a cada lance dos dois lados; é quase nada.
  'board-move': {
    volume: 0.4,
    cutoff: 1500,
    type: 'sine',
    notes: [
      { freq: 196, at: 0, dur: 0.05 },
      { freq: 392, at: 0, dur: 0.025, gain: 0.35 }
    ]
  },
  // O lance do outro: o mesmo toque de madeira, um tom abaixo e mais curto,
  // pra dar pra saber de olho fechado de quem foi.
  'board-move-opp': {
    volume: 0.38,
    cutoff: 1300,
    type: 'sine',
    notes: [
      { freq: 164.8, at: 0, dur: 0.045 },
      { freq: 329.6, at: 0, dur: 0.022, gain: 0.3 }
    ]
  },
  // Roque: rei e torre, dois toques colados.
  'board-castle': {
    volume: 0.42,
    cutoff: 1500,
    type: 'sine',
    notes: [
      { freq: 196, at: 0, dur: 0.04 },
      { freq: 220, at: 0.06, dur: 0.045 }
    ]
  },
  // Xeque: o toque da peça com um estalo agudo por cima.
  'board-check': {
    volume: 0.5,
    cutoff: 2600,
    type: 'triangle',
    notes: [
      { freq: 196, at: 0, dur: 0.045 },
      { freq: E5, at: 0.02, dur: 0.07, gain: 0.55 }
    ]
  },
  // Promoção: subindo, parente do `levelup` mas curto.
  'board-promote': {
    volume: 0.5,
    cutoff: 3000,
    notes: [
      { freq: G4, at: 0, dur: 0.06 },
      { freq: C5, at: 0.06, dur: 0.06 },
      { freq: E5, at: 0.12, dur: 0.1 }
    ]
  },
  // Pré-lance marcado: um tique baixinho, quase nada.
  'board-premove': {
    volume: 0.28,
    cutoff: 1800,
    type: 'sine',
    notes: [{ freq: 523.25, at: 0, dur: 0.03 }]
  },
  // A partida começou: duas notas subindo.
  'board-start': {
    volume: 0.55,
    cutoff: 2800,
    notes: [
      { freq: C5, at: 0, dur: 0.09 },
      { freq: G5, at: 0.1, dur: 0.14 }
    ]
  },
  // A partida acabou: as mesmas duas notas, descendo.
  'board-end': {
    volume: 0.55,
    cutoff: 2600,
    notes: [
      { freq: G5, at: 0, dur: 0.09 },
      { freq: C5, at: 0.1, dur: 0.16 }
    ]
  },
  // Dez segundos no relógio: três tiques secos.
  'board-low-time': {
    volume: 0.55,
    cutoff: 3200,
    type: 'square',
    notes: [
      { freq: B5, at: 0, dur: 0.03 },
      { freq: B5, at: 0.14, dur: 0.03 },
      { freq: B5, at: 0.28, dur: 0.03 }
    ]
  },
  // Lance proibido (peça sem saída com o rei em xeque): grave e curto.
  'board-illegal': {
    volume: 0.45,
    cutoff: 900,
    type: 'square',
    notes: [{ freq: 110, at: 0, dur: 0.09 }]
  },
  // Captura: a peça que sai e a que chega, dois toques.
  'board-capture': {
    volume: 0.45,
    cutoff: 1700,
    type: 'triangle',
    notes: [
      { freq: 261.6, at: 0, dur: 0.04 },
      { freq: 174.6, at: 0.075, dur: 0.065 }
    ]
  },
  // Bilhar: bola encaçapada (o "NICE SHOT" do Side Pocket): duas notas pra cima, curtas.
  'pool-nice': { volume: 0.5, cutoff: 3000, type: 'triangle', notes: [{ freq: E5, at: 0, dur: 0.07 }, { freq: 880, at: 0.08, dur: 0.14 }] },
  // Bilhar: falta — duas notas pra baixo, graves e secas.
  'pool-foul': { volume: 0.5, cutoff: 1400, type: 'square', notes: [{ freq: 220, at: 0, dur: 0.08 }, { freq: 146.8, at: 0.1, dur: 0.16 }] }
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
  wake(audio)

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

/** Folga depois do último aviso antes de suspender. O mais longo dura ~1s. */
const IDLE_SUSPEND_MS = 3_000

let idleTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Acorda o contexto pra tocar e agenda a suspensão.
 *
 * Contexto rodando mantém a saída de áudio aberta mesmo em silêncio, e pro
 * Windows isso é "um fluxo de áudio está em uso": o PC não dorme. Um aviso de
 * meio segundo não pode segurar o fone aberto pelo resto do dia.
 */
function wake(audio: AudioContext): void {
  // Sempre, não só quando 'suspended': um suspend ainda em andamento mostra
  // 'running', e o resume pedido depois dele é atendido depois dele.
  void audio.resume().catch(() => {})
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (audio.state === 'running') void audio.suspend().catch(() => {})
  }, IDLE_SUSPEND_MS)
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
  // Compartilhando o som do sistema: o aviso iria pro loopback e a call
  // inteira ouviria o ping deste launcher. Ver lib/launcher-silence.
  if (isLauncherSilenced()) return

  const noise = NOISE_CUES[name]
  const cue = CUES[name]
  if (!cue && !noise) return

  const audio = audioContext()
  if (!audio) return

  wake(audio)
  if (noise) playNoise(audio, noise, volume)
  else if (cue) playSynth(audio, cue, volume)
}

/**
 * Sons de PAPEL: batidas curtas de ruído branco num passa-banda. Carta não
 * tem nota — o estalo de uma carta saindo do baralho é um "tsk" de 40 ms
 * agudo; virar é um "fwip" mais longo e mais grave; embaralhar é uma rajada
 * de estalinhos (as duas metades se intercalando) e uma batida no fim
 * (o maço acertado na mesa).
 */
interface NoiseHit {
  /** Início, em segundos, contado do disparo. */
  at: number
  /** Duração, em segundos. */
  dur: number
  /** Centro do passa-banda, em Hz. */
  freq: number
  q?: number
  gain?: number
}

interface NoiseCue {
  volume: number
  hits: NoiseHit[]
}

function riffle(): NoiseHit[] {
  const hits: NoiseHit[] = [{ at: 0, dur: 0.08, freq: 1300, q: 0.6, gain: 0.6 }]
  for (let i = 0; i < 24; i++) {
    hits.push({ at: 0.32 + i * 0.022, dur: 0.018, freq: i % 2 ? 2900 : 2300, q: 1.4, gain: 0.45 + ((i * 7) % 5) * 0.08 })
  }
  hits.push({ at: 0.9, dur: 0.05, freq: 520, q: 0.8, gain: 1 })
  return hits
}

const NOISE_CUES: Partial<Record<UiSound, NoiseCue>> = {
  'poker-card': { volume: 0.5, hits: [{ at: 0, dur: 0.04, freq: 2700, q: 0.9 }] },
  'poker-flip': {
    volume: 0.55,
    hits: [
      { at: 0, dur: 0.075, freq: 1500, q: 0.7 },
      { at: 0.06, dur: 0.03, freq: 3300, q: 1.2, gain: 0.5 }
    ]
  },
  'poker-shuffle': { volume: 0.55, hits: riffle() },
  // Bilhar: o taco na branca — o estalo do couro e o baque da madeira.
  'pool-cue': { volume: 0.6, hits: [{ at: 0, dur: 0.035, freq: 1800, q: 1.2 }, { at: 0, dur: 0.05, freq: 320, q: 0.8, gain: 0.5 }] },
  // Bola em bola: clique de resina, agudo e curtíssimo. O volume vem da velocidade.
  'pool-hit': { volume: 0.7, hits: [{ at: 0, dur: 0.028, freq: 4200, q: 1.6 }, { at: 0, dur: 0.02, freq: 2300, q: 1, gain: 0.6 }] },
  // Tabela: baque abafado na borracha.
  'pool-cushion': { volume: 0.45, hits: [{ at: 0, dur: 0.07, freq: 260, q: 0.8 }, { at: 0, dur: 0.03, freq: 900, q: 1, gain: 0.35 }] },
  // Caçapa: bate no aro, cai e rola na calha.
  'pool-pocket': { volume: 0.6, hits: [{ at: 0, dur: 0.05, freq: 1400, q: 1.1, gain: 0.5 }, { at: 0.03, dur: 0.14, freq: 220, q: 0.7 }, { at: 0.16, dur: 0.1, freq: 500, q: 0.9, gain: 0.35 }] }
}

let noiseBuffer: AudioBuffer | null = null

function playNoise(audio: AudioContext, cue: NoiseCue, volume: number): void {
  if (!noiseBuffer || noiseBuffer.sampleRate !== audio.sampleRate) {
    const length = Math.floor(audio.sampleRate)
    noiseBuffer = audio.createBuffer(1, length, audio.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }
  const now = audio.currentTime
  const master = audio.createGain()
  master.gain.value = Math.min(1, volume) * cue.volume * 0.5
  master.connect(audio.destination)

  for (const hit of cue.hits) {
    const start = now + hit.at
    const end = start + hit.dur
    const source = audio.createBufferSource()
    source.buffer = noiseBuffer
    const band = audio.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = hit.freq
    band.Q.value = hit.q ?? 1
    const envelope = audio.createGain()
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(hit.gain ?? 1, start + 0.003)
    envelope.gain.exponentialRampToValueAtTime(0.0001, end)
    source.connect(band)
    band.connect(envelope)
    envelope.connect(master)
    // Cada batida pega um trecho diferente do ruído: senão todas soam iguais.
    source.start(start, Math.random() * 0.8, hit.dur + 0.02)
  }
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
