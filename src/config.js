const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CONFIG = Object.freeze({
  lastAddress: null,
  cameraName: 'ATEM|Blackmagic',
  cameraMode: null,
})

function defaults() {
  return { ...DEFAULT_CONFIG }
}

const isPositive = (n) => Number.isFinite(n) && n > 0
const isMode = (m) => m !== null && typeof m === 'object' && ['width', 'height', 'frameRate'].every((k) => isPositive(m[k]))

// Keep only known fields of the right type; anything else falls back to its default.
function sanitize(parsed) {
  const config = defaults()
  // 'ATEM Mini Pro' was the old default, persisted by earlier builds; it never matched the Windows camera name.
  if (typeof parsed.cameraName === 'string' && parsed.cameraName.trim() && parsed.cameraName.trim() !== 'ATEM Mini Pro') config.cameraName = parsed.cameraName.trim()
  if (typeof parsed.lastAddress === 'string' && parsed.lastAddress.trim()) config.lastAddress = parsed.lastAddress.trim()
  if (isMode(parsed.cameraMode)) {
    const { width, height, frameRate } = parsed.cameraMode
    config.cameraMode = { width, height, frameRate }
  }
  return config
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
  return sanitize(parsed)
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
