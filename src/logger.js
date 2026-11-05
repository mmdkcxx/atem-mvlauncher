const fs = require('node:fs')
const path = require('node:path')

// Small synchronous file logger. Logging must never take the app down, so every
// filesystem failure is swallowed.
function createLogger(filePath, { maxBytes = 1_000_000 } = {}) {
  function write(level, message) {
    const line = `${new Date().toISOString()} ${level} ${message}\n`
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      let size = 0
      try {
        size = fs.statSync(filePath).size
      } catch {
        // first write
      }
      if (size > 0 && size + Buffer.byteLength(line) > maxBytes) {
        fs.renameSync(filePath, `${filePath}.1`)
      }
      fs.appendFileSync(filePath, line)
    } catch {
      // ignore
    }
  }

  function tail(n) {
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
      return lines.slice(-n)
    } catch {
      return []
    }
  }

  return {
    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message) => write('ERROR', message),
    tail,
  }
}

module.exports = { createLogger }
