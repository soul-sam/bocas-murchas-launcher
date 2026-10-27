import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PONTOS,
  diaDe,
  palpiteAberto,
  pontosDoPalpite,
  rotuloDoDia,
  somarDias,
  textoDoApito,
  textoDoGol,
  zonaDe
} from './futebol-calc.ts'

const lado = (id: string, curto: string, gols: number | null) => ({
  id,
  nome: curto,
  curto,
  sigla: curto.slice(0, 3).toUpperCase(),
  escudo: null,
  cor: null,
  gols,
  penaltis: null,
  vencedor: false,
  forma: null
})

const jogo = (casa: number, fora: number) => ({
  id: '1',
  liga: 'bra.1',
  ligaNome: 'Brasileirão Série A',
  inicio: '2026-10-29T23:00:00Z',
  estado: 'in' as const,
  status: 'STATUS_SECOND_HALF',
  rotulo: "67'",
  casa: lado('819', 'Flamengo', casa),
  fora: lado('3454', 'Vasco', fora),
  estadio: null,
  cidade: null,
  fase: null,
  transmissao: null,
  lances: []
})

test('diaDe usa o dia de São Paulo, não o UTC', () => {
  assert.equal(diaDe(new Date('2026-11-04T00:30:00Z')), '20261103')
  assert.equal(diaDe(new Date('2026-11-04T03:00:00Z')), '20261104')
})

test('somarDias atravessa mês e ano', () => {
  assert.equal(somarDias('20261031', 1), '20261101')
  assert.equal(somarDias('20261231', 1), '20270101')
  assert.equal(somarDias('20261101', -1), '20261031')
})

test('rotuloDoDia: hoje, amanhã, ontem e o resto pelo dia da semana', () => {
  assert.deepEqual(rotuloDoDia('20261026', '20261026'), { curto: 'Hoje', numero: '26' })
  assert.equal(rotuloDoDia('20261027', '20261026').curto, 'Amanhã')
  assert.equal(rotuloDoDia('20261025', '20261026').curto, 'Ontem')
  // 29/10/2026 é uma quinta.
  assert.match(rotuloDoDia('20261029', '20261026').curto, /^qui/)
})

test('pontosDoPalpite espelha a API', () => {
  assert.equal(pontosDoPalpite({ home: 2, away: 1 }, { home: 2, away: 1 }), PONTOS.exato)
  assert.equal(pontosDoPalpite({ home: 2, away: 1 }, { home: 3, away: 2 }), PONTOS.saldo)
  assert.equal(pontosDoPalpite({ home: 1, away: 1 }, { home: 2, away: 2 }), PONTOS.saldo)
  assert.equal(pontosDoPalpite({ home: 3, away: 0 }, { home: 1, away: 0 }), PONTOS.resultado)
  assert.equal(pontosDoPalpite({ home: 1, away: 1 }, { home: 1, away: 0 }), PONTOS.erro)
})

test('palpiteAberto fecha no apito', () => {
  const agora = Date.parse('2026-10-29T22:00:00Z')
  assert.equal(palpiteAberto({ estado: 'pre', inicio: '2026-10-29T23:00:00Z' }, agora), true)
  assert.equal(palpiteAberto({ estado: 'pre', inicio: '2026-10-29T21:59:00Z' }, agora), false)
  assert.equal(palpiteAberto({ estado: 'in', inicio: '2026-10-29T23:00:00Z' }, agora), false)
})

test('zonaDe acha a faixa da posição', () => {
  const zonas = [
    { de: 1, ate: 4, nome: 'Libertadores', tom: 'acid' as const },
    { de: 17, ate: 20, nome: 'Rebaixamento', tom: 'destructive' as const }
  ]
  assert.equal(zonaDe(4, zonas)?.nome, 'Libertadores')
  assert.equal(zonaDe(10, zonas), null)
  assert.equal(zonaDe(17, zonas)?.nome, 'Rebaixamento')
})

test('textoDoGol: grita o gol do meu time, lamenta o gol contra ele, neutro pros outros', () => {
  const ev = { jogo: jogo(1, 0), timeId: '819', jogador: 'Pedro', minuto: "67'" }
  assert.equal(textoDoGol(ev, '819').title, 'GOL DO FLAMENGO!')
  assert.equal(textoDoGol(ev, '819').body, "Flamengo 1 x 0 Vasco · Pedro 67'")
  assert.equal(textoDoGol(ev, '3454').title, 'Gol do Flamengo...')
  assert.equal(textoDoGol(ev, null).title, 'Gol do Flamengo')
  assert.equal(textoDoGol({ ...ev, jogador: null, minuto: '' }, null).body, 'Flamengo 1 x 0 Vasco')
})

test('textoDoApito: começo e fim', () => {
  assert.deepEqual(textoDoApito({ tipo: 'inicio', jogo: jogo(0, 0) }), { title: 'Bola rolando', body: 'Flamengo x Vasco' })
  assert.deepEqual(textoDoApito({ tipo: 'fim', jogo: jogo(2, 2) }), { title: 'Fim de jogo', body: 'Flamengo 2 x 2 Vasco' })
})
