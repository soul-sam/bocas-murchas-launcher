/**
 * Roda com `npm run test:policy` (node --test, sem framework).
 *
 * O que esta sendo garantido: sem espectador a captura real PARA (a faixa
 * publicada vira um canvas sem quadro) e, quando alguem assina, a fonte e
 * readquirida e trocada de volta — sem nunca despublicar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCaptureGate } from './screen-capture-gate.ts'

type Listener = (update: unknown) => void

interface FakeTrack {
  kind: string
  stopped: boolean
  contentHint: string
  stop: () => void
}

const makeTrack = (kind: string): FakeTrack => {
  const track: FakeTrack = {
    kind,
    stopped: false,
    contentHint: '',
    stop: () => {
      track.stopped = true
    }
  }
  return track
}

function setup() {
  const listeners = new Set<Listener>()
  const replaced: Array<{ track: FakeTrack; userProvided: boolean }> = []
  const real = makeTrack('real')
  const videoTrack = {
    mediaStreamTrack: real as unknown,
    replaceTrack: async (track: FakeTrack, userProvided: boolean) => {
      // Mesma regra do SDK com userProvided=false: a faixa antiga para.
      ;(videoTrack.mediaStreamTrack as FakeTrack).stop()
      videoTrack.mediaStreamTrack = track
      replaced.push({ track, userProvided })
    }
  }
  let publication: { trackSid: string; videoTrack: typeof videoTrack } | undefined = {
    trackSid: 'TR_1',
    videoTrack
  }
  const room = {
    engine: {
      on: (_e: string, fn: Listener) => listeners.add(fn),
      off: (_e: string, fn: Listener) => listeners.delete(fn)
    },
    localParticipant: { getTrackPublication: () => publication }
  }

  const acquired: FakeTrack[] = []
  let failAcquire = false
  const selections: Array<[string, boolean]> = []
  let cancelled = 0

  ;(globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      captureStream: () => ({ getVideoTracks: () => [makeTrack('idle')] })
    })
  }
  // `navigator` no Node e um getter: sobrescreve pela propriedade.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getDisplayMedia: async () => {
          if (failAcquire) throw new Error('NotAllowedError')
          const track = makeTrack('real')
          acquired.push(track)
          return { getVideoTracks: () => [track] }
        }
      }
    }
  })
  ;(globalThis as Record<string, unknown>).window = {
    bocas: {
      screen: {
        selectSource: async (id: string, audio: boolean) => {
          selections.push([id, audio])
        },
        cancelSelection: async () => {
          cancelled += 1
        }
      }
    }
  }

  const emit = (enabled: boolean, trackSid = 'TR_1') => {
    for (const fn of listeners) {
      fn({ trackSid, subscribedQualities: [{ enabled }, { enabled: false }] })
    }
  }

  return {
    room,
    real,
    replaced,
    acquired,
    selections,
    emit,
    listeners,
    setFail: (v: boolean) => {
      failAcquire = v
    },
    cancelledCount: () => cancelled,
    unpublish: () => {
      publication = undefined
    }
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const gateOptions = (room: unknown, extra: Record<string, unknown> = {}) => ({
  room: room as never,
  sourceId: 'screen:0',
  resolution: { width: 1280, height: 720, frameRate: 30 },
  contentHint: 'motion' as const,
  graceMs: 20,
  ...extra
})


test('sem espectador: depois da carencia a captura real para e vira canvas', async () => {
  const s = setup()
  const states: string[] = []
  const gate = createCaptureGate(gateOptions(s.room, { onStateChange: (st: string) => states.push(st) }))
  assert.equal(gate.state, 'live')

  s.emit(false)
  assert.equal(gate.state, 'live', 'ainda na carencia')
  await wait(40)
  await settle()

  assert.equal(gate.state, 'idle')
  assert.equal(s.real.stopped, true, 'a captura real foi parada pelo replaceTrack')
  assert.equal(s.replaced.length, 1)
  assert.equal(s.replaced[0].track.kind, 'idle')
  assert.equal(s.replaced[0].userProvided, false)
  assert.deepEqual(states, ['idle'])
  gate.destroy()
})

test('espectador volta dentro da carencia: nada acontece', async () => {
  const s = setup()
  const gate = createCaptureGate(gateOptions(s.room))
  s.emit(false)
  await wait(5)
  s.emit(true)
  await wait(40)
  await settle()
  assert.equal(gate.state, 'live')
  assert.equal(s.replaced.length, 0)
  assert.equal(s.real.stopped, false)
  gate.destroy()
})

test('alguem assina: readquire a mesma fonte (so video) e troca de volta', async () => {
  const s = setup()
  const gate = createCaptureGate(gateOptions(s.room))
  s.emit(false)
  await wait(40)
  await settle()
  assert.equal(gate.state, 'idle')

  s.emit(true)
  await settle()
  await settle()

  assert.equal(gate.state, 'live')
  assert.deepEqual(s.selections, [['screen:0', false]])
  assert.equal(s.acquired.length, 1)
  assert.equal(s.acquired[0].contentHint, 'motion')
  assert.equal(s.replaced.length, 2)
  assert.equal(s.replaced[1].track, s.acquired[0])
  assert.equal(s.replaced[0].track.stopped, true, 'o canvas ocioso foi parado')
  gate.destroy()
})

test('fonte sumiu ao readquirir: avisa onLost e limpa a selecao', async () => {
  const s = setup()
  let lost = 0
  const gate = createCaptureGate(gateOptions(s.room, { onLost: () => (lost += 1) }))
  s.emit(false)
  await wait(40)
  await settle()
  s.setFail(true)
  s.emit(true)
  await settle()
  await settle()
  assert.equal(lost, 1)
  assert.equal(s.cancelledCount(), 1)
  assert.equal(gate.state, 'idle')
  gate.destroy()
})

test('sinal de outra faixa e ignorado; destroy solta o listener e o timer', async () => {
  const s = setup()
  const gate = createCaptureGate(gateOptions(s.room))
  s.emit(false, 'TR_OTHER')
  await wait(40)
  await settle()
  assert.equal(gate.state, 'live')

  s.emit(false)
  gate.destroy()
  await wait(40)
  await settle()
  assert.equal(gate.state, 'live', 'timer cancelado pelo destroy')
  assert.equal(s.listeners.size, 0)
})

test('publicacao acabou no meio da retomada: a faixa nova e descartada', async () => {
  const s = setup()
  const gate = createCaptureGate(gateOptions(s.room))
  s.emit(false)
  await wait(40)
  await settle()
  s.unpublish()
  s.emit(true)
  await settle()
  await settle()
  // Sem publicacao o sinal nem chega a tentar: nada readquirido.
  assert.equal(s.acquired.length, 0)
  assert.equal(gate.state, 'idle')
  gate.destroy()
})
