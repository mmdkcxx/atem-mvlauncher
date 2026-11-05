const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRelaunchGuard } = require('../src/relaunch-guard')

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mv-relaunch-')), 'relaunch.json')

test('allows 5 relaunches within a minute and refuses the 6th', () => {
  const file = tmpFile()
  let now = 1_000_000
  const guard = createRelaunchGuard(file, { now: () => now })
  const results = []
  for (let i = 0; i < 6; i++) {
    results.push(guard.allow())
    now += 1000
  }
  assert.deepEqual(results, [true, true, true, true, true, false])
})

test('relaunches older than the window no longer count', () => {
  const file = tmpFile()
  let now = 1_000_000
  const guard = createRelaunchGuard(file, { now: () => now })
  for (let i = 0; i < 5; i++) guard.allow()
  assert.equal(guard.allow(), false)
  now += 60_001
  assert.equal(guard.allow(), true)
})

test('the count survives a new process (a second guard on the same file)', () => {
  const file = tmpFile()
  const now = () => 2_000_000
  for (let i = 0; i < 5; i++) createRelaunchGuard(file, { now }).allow()
  assert.equal(createRelaunchGuard(file, { now }).allow(), false)
})

test('a missing or corrupt state file counts as no history and never throws', () => {
  const file = tmpFile()
  fs.writeFileSync(file, '{broken')
  assert.equal(createRelaunchGuard(file, { now: () => 1 }).allow(), true)
  assert.equal(createRelaunchGuard('/dev/null/nope/relaunch.json', { now: () => 1 }).allow(), true)
})

test('max and window are configurable', () => {
  const file = tmpFile()
  const guard = createRelaunchGuard(file, { max: 2, windowMs: 1000, now: () => 5000 })
  assert.deepEqual([guard.allow(), guard.allow(), guard.allow()], [true, true, false])
})
