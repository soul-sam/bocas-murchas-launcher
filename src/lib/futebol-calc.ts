/**
 * CONTAS DO FUTEBOL — sem rede e sem React, pra o `node --test` rodar direto
 * (ver futebol-calc.test.ts). A api-futebol.ts reexporta tudo.
 */
import type { ApitoEvento, Fonte, GolEvento, Jogo, Zona } from './api-futebol'

/** Mesma pontuação da API (lib/futebol/regras.ts). */
export const PONTOS = { exato: 10, saldo: 6, resultado: 4, erro: 0 } as const
export const GOLS_MAX = 15

// ---------------------------------------------------------------------------

/** AAAAMMDD no fuso de São Paulo. */
export function diaDe(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
    .format(date)
    .replace(/-/g, '')
}

/** Soma `n` dias a um AAAAMMDD (meio-dia de Brasília, longe da virada). */
export function somarDias(dia: string, n: number): string {
  const base = new Date(`${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}T12:00:00-03:00`)
  return diaDe(new Date(base.getTime() + n * 86_400_000))
}

export function horaDoJogo(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  )
}

export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  })
    .format(new Date(iso))
    .replace('.', '')
}

/** Rótulo do dia na fita: "Hoje", "Amanhã", "Ontem" ou "qua 29". */
export function rotuloDoDia(dia: string, hoje: string): { curto: string; numero: string } {
  const numero = dia.slice(6, 8)
  if (dia === hoje) return { curto: 'Hoje', numero }
  if (dia === somarDias(hoje, 1)) return { curto: 'Amanhã', numero }
  if (dia === somarDias(hoje, -1)) return { curto: 'Ontem', numero }
  const d = new Date(`${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}T12:00:00-03:00`)
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' })
    .format(d)
    .replace('.', '')
  return { curto: semana, numero }
}

/** Mesma conta da API, pra prévia "vale X" ao vivo. */
export function pontosDoPalpite(p: { home: number; away: number }, placar: { home: number; away: number }): number {
  const r = (a: number, b: number) => Math.sign(a - b)
  if (p.home === placar.home && p.away === placar.away) return PONTOS.exato
  if (r(p.home, p.away) !== r(placar.home, placar.away)) return PONTOS.erro
  if (p.home - p.away === placar.home - placar.away) return PONTOS.saldo
  return PONTOS.resultado
}

/** Jogo ainda aceita palpite (o servidor confere de novo). */
export function palpiteAberto(jogo: Pick<Jogo, 'estado' | 'inicio'>, agora = Date.now()): boolean {
  return jogo.estado === 'pre' && new Date(jogo.inicio).getTime() > agora
}

/** Zona da posição na tabela, se houver. */
export function zonaDe(posicao: number, zonas: readonly Zona[]): Zona | null {
  return zonas.find((z) => posicao >= z.de && posicao <= z.ate) ?? null
}

function placar(j: Jogo): string {
  return `${j.casa.curto} ${j.casa.gols ?? 0} x ${j.fora.gols ?? 0} ${j.fora.curto}`
}

/** Texto do aviso de gol: grito pro gol do meu time, lamento pro gol contra ele. */
export function textoDoGol(ev: GolEvento, meuTimeId: string | null): { title: string; body: string } {
  const time = ev.timeId === ev.jogo.casa.id ? ev.jogo.casa : ev.jogo.fora
  const autor = [ev.jogador, ev.minuto].filter(Boolean).join(' ')
  const meuMarcou = meuTimeId === time.id
  const meuSofreu = !!meuTimeId && !meuMarcou && (ev.jogo.casa.id === meuTimeId || ev.jogo.fora.id === meuTimeId)
  const title = meuMarcou ? `GOL DO ${time.curto.toUpperCase()}!` : meuSofreu ? `Gol do ${time.curto}...` : `Gol do ${time.curto}`
  return { title, body: autor ? `${placar(ev.jogo)} · ${autor}` : placar(ev.jogo) }
}

/** Ids da ESPN da Seleção masculina e da feminina (lib/futebol/ligas.ts na API). */
export const SELECAO_ID = '205'
export const SELECAO_FEMININA_ID = '2752'

/** O id da Seleção que está no jogo, ou null. */
export function selecaoDoJogo(jogo: Pick<Jogo, 'casa' | 'fora'>): string | null {
  for (const id of [jogo.casa.id, jogo.fora.id]) if (id === SELECAO_ID || id === SELECAO_FEMININA_ID) return id
  return null
}

/**
 * A fonte que o player abre sozinho: com o jogo rolando (ou pra começar), a
 * transmissão; encerrado, melhores momentos antes do jogo inteiro. Vídeo que
 * não deixa embutir só entra se não houver outro.
 */
export function escolherFonte(jogo: Pick<Jogo, 'estado'>, fontes: Fonte[]): Fonte | null {
  const ordem = jogo.estado === 'post' ? ['melhores', 'completo', 'aovivo'] : ['aovivo', 'completo', 'melhores']
  const ordenadas = [...fontes].sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo))
  return ordenadas.find((f) => f.embed) ?? ordenadas[0] ?? null
}

export const TIPO_FONTE: Record<Fonte['tipo'], string> = {
  aovivo: 'Transmissão',
  melhores: 'Melhores momentos',
  completo: 'Jogo completo'
}

export function textoDoApito(ev: ApitoEvento): { title: string; body: string } {
  if (ev.tipo === 'inicio') return { title: 'Bola rolando', body: `${ev.jogo.casa.curto} x ${ev.jogo.fora.curto}` }
  return { title: 'Fim de jogo', body: placar(ev.jogo) }
}
