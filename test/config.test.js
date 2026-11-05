const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DEFAULT_CONFIG, loadConfig, saveConfig, updateConfig } = require('../src/config')

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-config-'))
  return path.join(dir, 'config.json')
}

test('loadConfig returns defaults when the file is missing', () => {
  assert.deepEqual(loadConfig(tmpFile()), DEFAULT_CONFIG)
})

test('loadConfig returns defaults when the file is empty', () => {
  const f = tmpFile()
  fs.writeFileSync(f, '')
  assert.deepEqual(loadConfig(f), DEFAULT_CONFIG)
})

test('loadConfig returns defaults for corrupt JSON and moves the bad file aside', () => {
  const f = tmpFile()
  fs.writeFileSync(f, '{not json')
  assert.deepEqual(loadConfig(f), DEFAULT_CONFIG)
  assert.equal(fs.existsSync(f), false)
  const moved = fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith('config.json.corrupt-'))
  assert.equal(moved.length, 1)
})

test('loadConfig returns defaults when JSON is not an object', () => {
  const f = tmpFile()
  fs.writeFileSync(f, '[1,2]')
  assert.deepEqual(loadConfig(f), DEFAULT_CONFIG)
})

test('updateConfig persists a patch and keeps other fields at defaults', () => {
  const f = tmpFile()
  const result = updateConfig(f, { lastAddress: '172.28.8.201' })
  assert.equal(result.lastAddress, '172.28.8.201')
  const loaded = loadConfig(f)
  assert.equal(loaded.lastAddress, '172.28.8.201')
  assert.equal(loaded.cameraName, DEFAULT_CONFIG.cameraName)
  assert.equal(loaded.cameraMode, null)
})

test('saveConfig creates the parent folder and leaves no temp file behind', () => {
  const f = path.join(path.dirname(tmpFile()), 'nested', 'config.json')
  saveConfig(f, { ...DEFAULT_CONFIG, lastAddress: '10.0.0.1' })
  assert.equal(loadConfig(f).lastAddress, '10.0.0.1')
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['config.json'])
})
