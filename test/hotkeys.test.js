const test = require('node:test')
const assert = require('node:assert/strict')
const { actionForKey, createHoldDetector } = require('../src/hotkeys')

test('maps the maintenance keys', () => {
  assert.equal(actionForKey({ key: 'F1', ctrlKey: false }), 'status')
  assert.equal(actionForKey({ key: 'F2', ctrlKey: false }), 'address')
  assert.equal(actionForKey({ key: 'F3', ctrlKey: false }), 'camera-settings')
  assert.equal(actionForKey({ key: 'F11', ctrlKey: false }), 'fullscreen')
  assert.equal(actionForKey({ key: 'q', ctrlKey: true }), 'quit-hold')
  assert.equal(actionForKey({ key: 'Q', ctrlKey: true }), 'quit-hold')
})

test('everything else is ignored, including Ctrl with another key and Q without Ctrl', () => {
  assert.equal(actionForKey({ key: 'a', ctrlKey: false }), null)
  assert.equal(actionForKey({ key: 'w', ctrlKey: true }), null)
  assert.equal(actionForKey({ key: 'q', ctrlKey: false }), null)
  assert.equal(actionForKey({ key: 'Escape', ctrlKey: false }), null)
})

test('hold detector fires exactly once after 2000 ms', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fired = 0
  const hold = createHoldDetector(() => fired++)
  hold.down()
  t.mock.timers.tick(1999)
  assert.equal(fired, 0)
  t.mock.timers.tick(1)
  assert.equal(fired, 1)
  t.mock.timers.tick(5000)
  assert.equal(fired, 1)
})

test('releasing before the time cancels the hold', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fired = 0
  const hold = createHoldDetector(() => fired++)
  hold.down()
  t.mock.timers.tick(1999)
  hold.up()
  t.mock.timers.tick(5000)
  assert.equal(fired, 0)
})

test('auto-repeat keydown events do not restart or duplicate the hold', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fired = 0
  const hold = createHoldDetector(() => fired++)
  hold.down()
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(150)
    hold.down() // auto-repeat
  }
  assert.equal(fired, 0)
  t.mock.timers.tick(500)
  assert.equal(fired, 1)
})

test('the hold can be used again after it fired or was cancelled', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fired = 0
  const hold = createHoldDetector(() => fired++, 100)
  hold.down()
  t.mock.timers.tick(100)
  hold.up()
  hold.down()
  t.mock.timers.tick(100)
  assert.equal(fired, 2)
})
