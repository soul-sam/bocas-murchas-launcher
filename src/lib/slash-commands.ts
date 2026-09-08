/**
 * Comandos de barra do compositor.
 *
 * "/marcar sexta 21h LoL" abre o compositor de evento já com o texto;
 * "/enquete" abre o de enquete; "/bora" o de "bora?". O texto NÃO é enviado
 * como mensagem. Quem não conhece o comando manda o texto normal — ninguém
 * perde mensagem por causa de uma barra no começo.
 */

export type SlashCommand =
  | { kind: 'poll' }
  | { kind: 'event'; seed: string }
  | { kind: 'party'; seed: string }
  | { kind: 'drop'; seed: string }
  | { kind: 'shop' }
  | { kind: 'suggestion' }
  | { kind: 'smoke' }
  | { kind: 'clip' }
  | { kind: 'wrapped' }
  | { kind: 'music'; seed: string }

const ALIASES: Record<string, SlashCommand['kind']> = {
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
  loja: 'shop',
  lojinha: 'shop',
  shop: 'shop',
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
  wrapped: 'wrapped'
}

export function parseSlashCommand(text: string): SlashCommand | null {
  const match = /^\/([\p{L}]+)(?:\s+([\s\S]*))?$/u.exec(text.trim())
  if (!match) return null

  const kind = ALIASES[match[1].toLowerCase()]
  if (!kind) return null

  const seed = (match[2] ?? '').trim()

  switch (kind) {
    case 'poll':
      return { kind: 'poll' }
    case 'shop':
      return { kind: 'shop' }
    case 'suggestion':
      return { kind: 'suggestion' }
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
  }
}

/** Lista pro autocompletar quando a pessoa digita "/" */
export const SLASH_HELP: Array<{ command: string; hint: string }> = [
  { command: '/enquete', hint: 'Criar uma enquete' },
  { command: '/marcar', hint: 'Marcar na agenda — ex.: /marcar sexta 21h LoL' },
  { command: '/bora', hint: 'Chamar pra jogar agora — ex.: /bora lol' },
  { command: '/drop', hint: 'Anúncio animado (admin)' },
  { command: '/sugestao', hint: 'Pedir uma coisa nova, ou avisar que quebrou' },
  { command: '/loja', hint: 'Abrir a lojinha' },
  { command: '/fumaca', hint: 'Avisar que você entra daqui a pouco' },
  { command: '/clipe', hint: 'Salvar os últimos segundos da call' },
  { command: '/tocar', hint: 'Pedir uma música pra call — ex.: /tocar seu link' },
  { command: '/retrospectiva', hint: 'Seu ano murcho, em slides' }
]
