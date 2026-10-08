import test from 'node:test'
import assert from 'node:assert/strict'
import { breakdown, chipFace, chipSet, rackBreakdown, sumChips } from './poker-chips.ts'

const values = (set: { value: number }[]): number[] => set.map((d) => d.value)
const total = (stacks: { denom: { value: number }; count: number }[]): number =>
  stacks.reduce((s, x) => s + x.denom.value * x.count, 0)

test('fichas: as cinco de cada mesa saem dos blinds, redondas', () => {
  assert.deepEqual(values(chipSet(5, 10)), [5, 10, 50, 250, 1_000])
  assert.deepEqual(values(chipSet(25, 50)), [25, 50, 250, 1_000, 5_000])
  assert.deepEqual(values(chipSet(100, 200)), [100, 200, 1_000, 5_000, 20_000])
  assert.deepEqual(values(chipSet(10, 20)), [10, 20, 100, 500, 2_000])
})

test('fichas: blind estranho ainda fecha a conta com a menor ficha', () => {
  const set = chipSet(15, 30)
  for (const d of set) assert.equal(d.value % 15, 0, `ficha ${d.value} não é múltiplo de 15`)
  assert.equal(total(breakdown(1_245, set)), 1_245)
})

test('fichas: tons sobem de 0 em diante, sem repetir valor', () => {
  const set = chipSet(5, 10)
  assert.deepEqual(set.map((d) => d.tone), [0, 1, 2, 3, 4])
  assert.equal(new Set(values(set)).size, set.length)
})

test('pilha: guloso, da maior pra menor, soma certa', () => {
  const set = chipSet(5, 10)
  const stacks = breakdown(1_365, set)
  assert.deepEqual(
    stacks.map((s) => [s.denom.value, s.count]),
    [
      [1_000, 1],
      [250, 1],
      [50, 2],
      [10, 1],
      [5, 1]
    ]
  )
  assert.equal(total(stacks), 1_365)
})

test('pilha: zero, negativo e NaN não desenham nada', () => {
  const set = chipSet(5, 10)
  assert.deepEqual(breakdown(0, set), [])
  assert.deepEqual(breakdown(-10, set), [])
  assert.deepEqual(breakdown(Number.NaN, set), [])
})

test('pilha: sobra quebrada vira mais uma ficha pequena', () => {
  const set = chipSet(5, 10)
  const stacks = breakdown(17, set)
  assert.deepEqual(
    stacks.map((s) => [s.denom.value, s.count]),
    [
      [10, 1],
      [5, 2]
    ]
  )
})

test('rack: um pouco de cada ficha pequena, o resto nas grandes, soma certa', () => {
  const set = chipSet(5, 10)
  const stacks = rackBreakdown(1_000, set)
  assert.equal(total(stacks), 1_000)
  const by = new Map(stacks.map((s) => [s.denom.value, s.count]))
  assert.equal(by.get(5), 4)
  assert.ok((by.get(10) ?? 0) >= 4)
  assert.ok((by.get(50) ?? 0) >= 4)
  assert.ok((by.get(250) ?? 0) >= 1)
})

test('rack: pilha pequena não inventa ficha', () => {
  const set = chipSet(5, 10)
  assert.equal(total(rackBreakdown(35, set)), 35)
  assert.deepEqual(rackBreakdown(0, set), [])
})

test('soma das fichas escolhidas', () => {
  assert.equal(sumChips([]), 0)
  assert.equal(sumChips([250, 50, 50, 10]), 360)
})

test('rótulo da ficha', () => {
  assert.equal(chipFace(5, 'murchos'), '5')
  assert.equal(chipFace(250, 'murchos'), '250')
  assert.equal(chipFace(1_000, 'murchos'), '1k')
  assert.equal(chipFace(2_500, 'murchos'), '2,5k')
  assert.equal(chipFace(20_000, 'murchos'), '20k')
  assert.equal(chipFace(10, 'brl'), '10¢')
  assert.equal(chipFace(100, 'brl'), 'R$1')
  assert.equal(chipFace(2_000, 'brl'), 'R$20')
  assert.equal(chipFace(250, 'brl'), 'R$2,50')
})
