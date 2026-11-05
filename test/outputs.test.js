const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { SOURCE, TARGET_AUX, planAuxFixes, ensureOutputs } = require('../src/outputs')

// Fake ATEM: `confirm` controls whether setAuxSource is acknowledged by a stateChanged event.
function fakeAtem(initial, { confirm = true } = {}) {
  const atem = new EventEmitter()
  atem.state = { video: { auxilliaries: [...initial] } }
  atem.calls = []
  atem.setAuxSource = async (source, bus) => {
    atem.calls.push([source, bus])
    if (confirm) {
      atem.state.video.auxilliaries[bus] = source
      setImmediate(() => atem.emit('stateChanged', atem.state, [`video.auxilliaries.${bus}`]))
    }
  }
  return atem
}

test('targets: Aux 0 is Program, Aux 1 is Multi View', () => {
  assert.equal(SOURCE.PROGRAM, 10010)
  assert.equal(SOURCE.MULTIVIEW, 9001)
  assert.deepEqual(TARGET_AUX, [10010, 9001])
})

test('planAuxFixes: state after ATEM restart needs both Aux changed', () => {
  assert.deepEqual(planAuxFixes([9001, 10010]), [
    { bus: 0, source: 10010 },
    { bus: 1, source: 9001 },
  ])
})

test('planAuxFixes: correct state needs nothing', () => {
  assert.deepEqual(planAuxFixes([10010, 9001]), [])
})

test('planAuxFixes: only the wrong Aux is listed', () => {
  assert.deepEqual(planAuxFixes([10010, 10010]), [{ bus: 1, source: 9001 }])
})

test('planAuxFixes: missing Aux entries count as wrong', () => {
  assert.deepEqual(planAuxFixes([]), [
    { bus: 0, source: 10010 },
    { bus: 1, source: 9001 },
  ])
})

test('ensureOutputs sends nothing when Aux are already correct', async () => {
  const atem = fakeAtem([10010, 9001])
  let fixing = 0
  const result = await ensureOutputs(atem, { onFixing: () => fixing++ })
  assert.deepEqual(result, { ok: true, fixed: [] })
  assert.deepEqual(atem.calls, [])
  assert.equal(fixing, 0)
})

test('ensureOutputs fixes wrong Aux, calls onFixing once, and reports ok', async () => {
  const atem = fakeAtem([9001, 10010])
  let fixing = 0
  const result = await ensureOutputs(atem, { onFixing: () => fixing++ })
  assert.equal(result.ok, true)
  assert.deepEqual(result.fixed, [
    { bus: 0, source: 10010 },
    { bus: 1, source: 9001 },
  ])
  assert.deepEqual(atem.calls, [
    [10010, 0],
    [9001, 1],
  ])
  assert.equal(fixing, 1)
})

test('ensureOutputs leaves a correct Aux alone and only changes the wrong one', async () => {
  const atem = fakeAtem([10010, 10010])
  const result = await ensureOutputs(atem)
  assert.equal(result.ok, true)
  assert.deepEqual(atem.calls, [[9001, 1]])
})

test('ensureOutputs retries 3 times per bus then reports ok:false when never confirmed', async () => {
  const atem = fakeAtem([9001, 10010], { confirm: false })
  const result = await ensureOutputs(atem, { confirmMs: 10 })
  assert.equal(result.ok, false)
  assert.equal(atem.calls.filter(([, bus]) => bus === 0).length, 3)
  assert.equal(atem.calls.filter(([, bus]) => bus === 1).length, 3)
})

test('ensureOutputs reports ok:false when setAuxSource rejects', async () => {
  const atem = fakeAtem([9001, 10010])
  atem.setAuxSource = async () => {
    throw new Error('socket closed')
  }
  const result = await ensureOutputs(atem, { confirmMs: 10 })
  assert.equal(result.ok, false)
})
