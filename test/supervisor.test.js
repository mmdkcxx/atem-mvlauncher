const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createSupervisor } = require('../src/supervisor')

const TIMINGS = { connectMs: 40, notFoundAfterMs: 120, retryMs: 10, outputRetryMs: 50 }

const until = async (cond, ms = 1500) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 2))
  }
  throw new Error('timed out waiting for condition')
}

// A fake ATEM world: `reachable` decides which addresses answer with a 'connected' event.
function makeWorld(reachableList = []) {
  const world = {
    reachable: new Set(reachableList),
    atems: [],
    connectCalls: [],
    createAtem() {
      const atem = new EventEmitter()
      atem.destroyed = false
      atem.state = { video: { auxilliaries: [] } }
      atem.connect = async (address) => {
        world.connectCalls.push(address)
        atem.address = address
        if (world.reachable.has(address)) setImmediate(() => atem.emit('connected'))
      }
      atem.disconnect = async () => {}
      atem.destroy = async () => {
        atem.destroyed = true
      }
      world.atems.push(atem)
      return atem
    },
  }
  return world
}

function setup({ reachable = [], candidates = [], ensure, timings = {} } = {}) {
  const world = makeWorld(reachable)
  const states = []
  const connected = []
  const ensureCalls = []
  const supervisor = createSupervisor({
    createAtem: () => world.createAtem(),
    getCandidates: async () => candidates.map((address) => ({ address, via: 'test' })),
    ensureOutputs:
      ensure ??
      (async (atem, opts) => {
        ensureCalls.push(atem)
        return { ok: true, fixed: [] }
      }),
    onConnected: (address) => connected.push(address),
    timings: { ...TIMINGS, ...timings },
  })
  supervisor.on('state', (s) => states.push(s))
  const names = () => states.map((s) => s.state)
  return { world, supervisor, states, names, connected, ensureCalls }
}

const isSubsequence = (needle, haystack) => {
  let i = 0
  for (const x of haystack) if (x === needle[i]) i++
  return i === needle.length
}

test('tries the next candidate when the first does not answer within connectMs', async () => {
  const t = setup({ reachable: ['B'], candidates: ['A', 'B'] })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  assert.deepEqual(t.world.connectCalls.slice(0, 2), ['A', 'B'])
  assert.equal(t.world.atems[0].destroyed, true, 'the unanswered attempt is destroyed')
  await t.supervisor.stop()
})

test('connecting, checking, ready in order, and onConnected gets the address', async () => {
  const t = setup({ reachable: ['B'], candidates: ['B'] })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  assert.ok(isSubsequence(['searching', 'connecting', 'checking', 'ready'], t.names()))
  assert.deepEqual(t.connected, ['B'])
  const ready = t.states.find((s) => s.state === 'ready')
  assert.equal(ready.address, 'B')
  assert.equal(ready.outputWarning, false)
  await t.supervisor.stop()
})

test('emits setting before ready when ensureOutputs reports it is fixing', async () => {
  const ensure = async (atem, opts) => {
    opts.onFixing()
    return { ok: true, fixed: [{ bus: 1, source: 9001 }] }
  }
  const t = setup({ reachable: ['B'], candidates: ['B'], ensure })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  assert.ok(isSubsequence(['checking', 'setting', 'ready'], t.names()))
  await t.supervisor.stop()
})

test('ensureOutputs failure gives ready with outputWarning, then retries every outputRetryMs', async () => {
  let calls = 0
  const ensure = async () => {
    calls++
    return calls === 1 ? { ok: false, fixed: [] } : { ok: true, fixed: [] }
  }
  const t = setup({ reachable: ['B'], candidates: ['B'], ensure })
  t.supervisor.start()
  await until(() => t.states.some((s) => s.state === 'ready' && s.outputWarning === true))
  await until(() => t.states.some((s) => s.state === 'ready' && s.outputWarning === false))
  assert.ok(calls >= 2)
  await t.supervisor.stop()
})

test('not-found after notFoundAfterMs and the search keeps going', async () => {
  const t = setup({ reachable: [], candidates: ['A'] })
  t.supervisor.start()
  await until(() => t.names().includes('not-found'))
  t.world.reachable.add('A')
  await until(() => t.names().includes('ready'))
  assert.ok(isSubsequence(['not-found', 'checking', 'ready'], t.names()))
  await t.supervisor.stop()
})

test('once not-found, further failed attempts do not flip back to connecting', async () => {
  const t = setup({ reachable: [], candidates: ['A'] })
  t.supervisor.start()
  await until(() => t.names().includes('not-found'))
  const before = t.names().length
  await new Promise((r) => setTimeout(r, 150))
  const after = t.names().slice(before)
  assert.ok(!after.includes('connecting'), `got ${after.join(',')}`)
  await t.supervisor.stop()
})

test('disconnect while ready: back to searching, old ATEM destroyed, new one created, outputs re-checked', async () => {
  const t = setup({ reachable: ['B'], candidates: ['B'] })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  const first = t.world.atems[t.world.atems.length - 1]
  first.emit('disconnected')
  await until(() => t.names().filter((n) => n === 'ready').length >= 2)
  assert.equal(first.destroyed, true)
  assert.ok(t.world.atems.length >= 2)
  assert.ok(t.ensureCalls.length >= 2, 'outputs are checked again after reconnecting')
  const afterFirstReady = t.names().slice(t.names().indexOf('ready') + 1)
  assert.ok(afterFirstReady.includes('searching'))
  await t.supervisor.stop()
})

test('disconnect while ensureOutputs is pending: searching again, no unhandled rejection', async () => {
  const rejections = []
  const onRejection = (e) => rejections.push(e)
  process.on('unhandledRejection', onRejection)
  let rejectPending
  let first = true
  const ensure = (atem, opts) => {
    if (first) {
      first = false
      return new Promise((_, reject) => {
        rejectPending = reject
      })
    }
    return Promise.resolve({ ok: true, fixed: [] })
  }
  const t = setup({ reachable: ['B'], candidates: ['B'], ensure })
  t.supervisor.start()
  await until(() => t.names().includes('checking'))
  t.world.atems[t.world.atems.length - 1].emit('disconnected')
  await until(() => t.names().includes('searching', t.names().indexOf('checking')) && t.names().lastIndexOf('searching') > t.names().indexOf('checking'))
  rejectPending(new Error('socket closed'))
  await until(() => t.names().includes('ready'))
  await new Promise((r) => setTimeout(r, 30))
  process.off('unhandledRejection', onRejection)
  assert.deepEqual(rejections, [])
  await t.supervisor.stop()
})

test('three failing candidates are all tried before waiting retryMs', async () => {
  const t = setup({ reachable: [], candidates: ['A', 'B', 'C'], timings: { connectMs: 20, retryMs: 400, notFoundAfterMs: 5000 } })
  t.supervisor.start()
  await until(() => t.world.connectCalls.length >= 3)
  assert.deepEqual(t.world.connectCalls, ['A', 'B', 'C'])
  await t.supervisor.stop()
})

test('tryAddress to an address that answers returns true, calls onConnected and goes ready', async () => {
  const t = setup({ reachable: ['X'], candidates: ['A'] })
  t.supervisor.start()
  await until(() => t.names().includes('searching'))
  assert.equal(await t.supervisor.tryAddress('X'), true)
  await until(() => t.names().includes('ready'))
  assert.deepEqual(t.connected, ['X'])
  assert.equal(t.states.find((s) => s.state === 'ready').address, 'X')
  await t.supervisor.stop()
})

test('tryAddress to an address that does not answer returns false and leaves the connection alone', async () => {
  const t = setup({ reachable: ['B'], candidates: ['B'] })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  const current = t.world.atems[t.world.atems.length - 1]
  const readyCount = t.names().filter((n) => n === 'ready').length
  assert.equal(await t.supervisor.tryAddress('NOPE'), false)
  assert.equal(current.destroyed, false)
  assert.equal(t.names().filter((n) => n === 'ready').length, readyCount)
  assert.deepEqual(t.connected, ['B'])
  await t.supervisor.stop()
})

test('stop destroys the current ATEM and no more states are emitted', async () => {
  const t = setup({ reachable: ['B'], candidates: ['B'] })
  t.supervisor.start()
  await until(() => t.names().includes('ready'))
  const current = t.world.atems[t.world.atems.length - 1]
  await t.supervisor.stop()
  assert.equal(current.destroyed, true)
  const count = t.states.length
  current.emit('disconnected')
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(t.states.length, count)
})
