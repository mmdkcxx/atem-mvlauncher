const test = require('node:test')
const assert = require('node:assert/strict')
const { createStateLogFilter } = require('../src/state-log')

const s = (state, extra = {}) => ({ state, outputWarning: false, ...extra })

test('while looking for the ATEM, searching and connecting flips are logged once', () => {
  const filter = createStateLogFilter()
  const logged = [
    s('searching'),
    s('connecting', { address: 'A' }),
    s('searching'),
    s('connecting', { address: 'A' }),
    s('searching'),
  ].filter((x) => filter(x))
  assert.equal(logged.length, 1)
})

test('not-found is logged once, then ready, with changes in between', () => {
  const filter = createStateLogFilter()
  const seq = [s('searching'), s('not-found'), s('not-found'), s('checking', { address: 'A' }), s('ready', { address: 'A' })]
  assert.deepEqual(seq.map((x) => filter(x)), [true, true, false, true, true])
})

test('an output warning change on ready is logged, a repeat is not', () => {
  const filter = createStateLogFilter()
  const ready = s('ready', { address: 'A' })
  const warn = s('ready', { address: 'A', outputWarning: true })
  assert.deepEqual([ready, warn, warn, ready].map((x) => filter(x)), [true, true, false, true])
})

test('a different address on the same state is logged', () => {
  const filter = createStateLogFilter()
  assert.deepEqual(
    [s('ready', { address: 'A' }), s('ready', { address: 'B' })].map((x) => filter(x)),
    [true, true],
  )
})

test('going back to searching after ready is logged again', () => {
  const filter = createStateLogFilter()
  assert.deepEqual(
    [s('searching'), s('ready', { address: 'A' }), s('searching')].map((x) => filter(x)),
    [true, true, true],
  )
})
