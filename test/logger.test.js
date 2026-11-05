const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createLogger } = require('../src/logger')

const tmpFile = (name = 'app.log') => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mv-log-')), name)

test('tail(2) returns the last two messages in order', () => {
  const log = createLogger(tmpFile())
  log.info('one')
  log.info('two')
  log.info('three')
  const lines = log.tail(2)
  assert.equal(lines.length, 2)
  assert.match(lines[0], /two$/)
  assert.match(lines[1], /three$/)
})

test('each line has an ISO timestamp and the level', () => {
  const log = createLogger(tmpFile())
  log.warn('careful')
  log.error('broken')
  const [warn, error] = log.tail(2)
  assert.match(warn, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z WARN careful$/)
  assert.match(error, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z ERROR broken$/)
})

test('tail on a log that does not exist yet returns an empty list', () => {
  assert.deepEqual(createLogger(tmpFile()).tail(5), [])
})

test('rotates to <file>.1 when maxBytes would be exceeded and keeps the main file within the limit', () => {
  const file = tmpFile()
  const log = createLogger(file, { maxBytes: 300 })
  for (let i = 0; i < 20; i++) log.info(`message number ${i}`)
  assert.equal(fs.existsSync(`${file}.1`), true)
  assert.ok(fs.statSync(file).size <= 300)
  assert.match(log.tail(1)[0], /message number 19$/)
})

test('creates the parent folder when it does not exist', () => {
  const file = path.join(path.dirname(tmpFile()), 'deep', 'er', 'app.log')
  createLogger(file).info('hello')
  assert.equal(fs.existsSync(file), true)
})

test('a write that cannot succeed never throws', () => {
  const log = createLogger('/dev/null/not-a-folder/app.log')
  assert.doesNotThrow(() => log.info('into the void'))
  assert.deepEqual(log.tail(3), [])
})
