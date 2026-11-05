const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CONFIG = Object.freeze({
  lastAddress: null,
  cameraName: 'ATEM Mini Pro',
  cameraMode: null,
})

function defaults() {
  return { ...DEFAULT_CONFIG }
}

function loadConfig(filePath) {
  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch {
    return defaults()
  }
  if (raw.trim() === '') return defaults()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    try {
      fs.renameSync(filePath, `${filePath}.corrupt-${Date.now()}`)
    } catch {
      // keep going with defaults even if the bad file cannot be moved
    }
    return defaults()
  }
  return { ...defaults(), ...parsed }
}

function saveConfig(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
  fs.renameSync(tmp, filePath)
}

function updateConfig(filePath, patch) {
  const next = { ...loadConfig(filePath), ...patch }
  saveConfig(filePath, next)
  return next
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig, updateConfig }
