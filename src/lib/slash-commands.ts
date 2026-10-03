/**
 * Comandos de barra do compositor.
 *
 * "/marcar sexta 21h LoL" abre o compositor de evento já com o texto;
 * "/enquete" abre o de enquete; "/bora" o de "bora?". O texto NÃO é enviado
 * como mensagem. Quem não conhece o comando manda o texto normal — ninguém
 * perde mensagem por causa de uma barra no começo.
 */

import type { EggEffect } from './easter-eggs/bus'

export type SlashCommand =
  | { kind: 'poll' }
  | { kind: 'event'; seed: string }
  | { kind: 'party'; seed: string }
  | { kind: 'drop'; seed: string }
  | { kind: 'shop' }
  | { kind: 'achievements' }
  /** Painéis da Arena (coluna da direita): ranking, apostas, recap. */
  | { kind: 'ranking' }
  | { kind: 'wagers' }
  /** O pôquer (saguão, ou a mesa em que a pessoa está). */
  | { kind: 'poker' }
  | { kind: 'recap' }
  | { kind: 'suggestion' }
  | { kind: 'printRequest' }
  | { kind: 'smoke' }
  | { kind: 'clip' }
  | { kind: 'wrapped' }
  | { kind: 'music'; seed: string }
  /** Anúncio oficial pela boca do bot (admin). */
  | { kind: 'announce'; seed: string }
  /** Easter-egg: efeito só na tela de quem mandou. Fora do SLASH_HELP de propósito. */
  | { kind: 'egg'; effect: EggEffect; seed: string }

/**
 * Comandos escondidos (components/easter-eggs). NÃO entram no SLASH_HELP: o
 * autocompletar entregaria o ovo. O texto não vira mensagem — a graça é só
 * de quem digitou. O "/f" é o único que fala no chat, e mora em
 * `rewriteEggCommand` por isso.
 */
const EGG_COMMANDS: Record<string, EggEffect> = {
  murchar: 'murchar',
  murcha: 'murchar',
  sudo: 'sudo',
  matrix: 'matrix',
  xyzzy: 'xyzzy',
  girar: 'girar',
  barrelroll: 'girar'
}

const ALIASES: Record<string, Exclude<SlashCommand['kind'], 'egg'>> = {
  enquete: 'poll',
  poll: 'poll',
  votacao: 'poll',
  votação: 'poll',
  marcar: 'event',
  evento: 'event',
  agenda: 'event',
  bora: 'party',
  party: 'party',
  drop: 'drop',
  sugestao: 'suggestion',
  sugestão: 'suggestion',
  sugerir: 'suggestion',
  ideia: 'suggestion',
  bug: 'suggestion',
  encomendar: 'printRequest',
  encomenda: 'printRequest',
  imprimir: 'printRequest',
  loja: 'shop',
  lojinha: 'shop',
  shop: 'shop',
  conquistas: 'achievements',
  conquista: 'achievements',
  badges: 'achievements',
  medalhas: 'achievements',
  ranking: 'ranking',
  rank: 'ranking',
  placar: 'ranking',
  top: 'ranking',
  apostas: 'wagers',
  aposta: 'wagers',
  apostar: 'wagers',
  bet: 'wagers',
  poker: 'poker',
  poquer: 'poker',
  pôquer: 'poker',
  holdem: 'poker',
  cartas: 'poker',
  recap: 'recap',
  semana: 'recap',
  fumaca: 'smoke',
  fumaça: 'smoke',
  sinal: 'smoke',
  entro: 'smoke',
  clipe: 'clip',
  clip: 'clip',
  clipar: 'clip',
  tocar: 'music',
  musica: 'music',
  música: 'music',
  som: 'music',
  dj: 'music',
  retrospectiva: 'wrapped',
  retro: 'wrapped',
  ano: 'wrapped',
  wrapped: 'wrapped',
  anunciar: 'announce',
  anuncio: 'announce',
  anúncio: 'announce',
  aviso: 'announce'
}

export function parseSlashCommand(text: string): SlashCommand | null {
  const match = /^\/([\p{L}]+)(?:\s+([\s\S]*))?$/u.exec(text.trim())
  if (!match) return null

  const seed = (match[2] ?? '').trim()

  const egg = EGG_COMMANDS[match[1].toLowerCase()]
  if (egg) return { kind: 'egg', effect: egg, seed }

  const kind = ALIASES[match[1].toLowerCase()]
  if (!kind) return null

  switch (kind) {
    case 'poll':
      return { kind: 'poll' }
    case 'shop':
      return { kind: 'shop' }
    case 'achievements':
      return { kind: 'achievements' }
    case 'ranking':
      return { kind: 'ranking' }
    case 'wagers':
      return { kind: 'wagers' }
    case 'poker':
      return { kind: 'poker' }
    case 'recap':
      return { kind: 'recap' }
    case 'suggestion':
      return { kind: 'suggestion' }
    case 'printRequest':
      return { kind: 'printRequest' }
    case 'smoke':
      return { kind: 'smoke' }
    case 'clip':
      return { kind: 'clip' }
    case 'wrapped':
      return { kind: 'wrapped' }
    case 'event':
      return { kind: 'event', seed }
    case 'party':
      return { kind: 'party', seed }
    case 'drop':
      return { kind: 'drop', seed }
    case 'music':
      return { kind: 'music', seed }
    case 'announce':
      return { kind: 'announce', seed }
  }
}

/**
 * O BOT (@bocasbot) — comandos que viram MENSAGEM, e não abrem nada.
 *
 * "/perguntar quem tá online" é só um atalho pra "@bocasbot quem tá online":
 * a pergunta fica no chat, visível, e o bot responde em cima dela. Mandar
 * escondido seria mais esquisito do que útil — metade da graça é a galera ver
 * o que foi perguntado. Quem decide responder é o servidor (modules/bot.ts).
 */
export const BOT_HANDLE = '@bocasbot'

export function rewriteBotCommand(text: string): string | null {
  const match = /^\/([\p{L}]+)(?:\s+([\s\S]*))?$/u.exec(text.trim())
  if (!match) return null
  const name = match[1].toLowerCase()
  const seed = (match[2] ?? '').trim()

  if (name === 'perguntar' || name === 'pergunta' || name === 'bot' || name === 'ia') {
    return seed ? `${BOT_HANDLE} ${seed}` : `${BOT_HANDLE} ajuda`
  }
  if (name === 'resumo' || name === 'resumir' || name === 'perdi') {
    // "/resumo 3" = últimas 3 horas; texto livre vai junto como está.
    const hours = /^\d{1,3}$/.test(seed) ? Number(seed) : null
    if (hours) return `${BOT_HANDLE} o que eu perdi aqui nas últimas ${hours} horas? Resume pra mim.`
    return `${BOT_HANDLE} o que eu perdi aqui? Resume pra mim.${seed ? ` ${seed}` : ''}`
  }
  if (name === 'sortear' || name === 'sorteia') {
    return seed ? `${BOT_HANDLE} sorteia ${seed}` : null
  }
  if (name === 'dado' || name === 'rolar') return `${BOT_HANDLE} ${seed || 'dado'}`
  if (name === 'times') return `${BOT_HANDLE} times${seed ? ` ${seed}` : ''}`
  return null
}

/**
 * "/f" vira um "F" no chat (e a chuva de F na tela de quem mandou, disparada
 * pelo compositor). Qualquer outra coisa: null, segue o caminho normal.
 */
export function rewriteEggCommand(text: string): string | null {
  return /^\/f$/i.test(text.trim()) ? 'F' : null
}

/** Lista pro autocompletar quando a pessoa digita "/" */
export const SLASH_HELP: Array<{ command: string; hint: string }> = [
  { command: '/enquete', hint: 'Criar uma enquete' },
  { command: '/marcar', hint: 'Marcar na agenda — ex.: /marcar sexta 21h LoL' },
  { command: '/bora', hint: 'Chamar pra jogar agora — ex.: /bora lol' },
  { command: '/drop', hint: 'Anúncio animado (admin)' },
  { command: '/sugestao', hint: 'Pedir uma coisa nova, ou avisar que quebrou' },
  { command: '/encomendar', hint: 'Pedir pra alguém imprimir uma peça na impressora 3D' },
  { command: '/ranking', hint: 'Quem lidera a semana (e desde sempre)' },
  { command: '/apostas', hint: 'Partidas ao vivo pra apostar murchos' },
  { command: '/poker', hint: "Mesas de Texas Hold'em: murchos, ou valendo até R$ 20" },
  { command: '/loja', hint: 'Abrir a lojinha' },
  { command: '/conquistas', hint: 'Todas as badges, quem tem cada uma e o placar de colecionador' },
  { command: '/recap', hint: 'O recap da semana e as anteriores' },
  { command: '/fumaca', hint: 'Avisar que você entra daqui a pouco' },
  { command: '/clipe', hint: 'Salvar os últimos segundos da call' },
  { command: '/tocar', hint: 'Pedir uma música pra call — ex.: /tocar seu link' },
  { command: '/retrospectiva', hint: 'Seu ano murcho, em slides' },
  { command: '/perguntar', hint: 'Pergunta pro Bocas Bot — ex.: /perguntar quem lidera em murchos?' },
  { command: '/resumo', hint: 'O bot resume o que você perdeu aqui — ex.: /resumo 3 (horas)' },
  { command: '/sortear', hint: 'Sorteio de verdade — ex.: /sortear pizza, japa, hambúrguer' },
  { command: '/times', hint: 'Divide quem está na sua call em times — ex.: /times 3' },
  { command: '/dado', hint: 'Rola dados — ex.: /dado 2d20' },
  { command: '/anunciar', hint: 'Aviso oficial, publicado pelo Bocas Bot (admin)' }
]
