const fs = require('node:fs')
const path = require('node:path')

// Limits automatic relaunches to `max` per `windowMs`. Every relaunch is a new process,
// so the timestamps live in a file, not in memory. A state file that cannot be read or
// written counts as "no history": better to relaunch than to stay dead.
function createRelaunchGuard(filePath, { max = 5, windowMs = 60_000, now = Date.now } = {}) {
  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      return Array.isArray(data) ? data.filter((t) => typeof t === 'number') : []
    } catch {
      return []
    }
  }

  return {
    allow() {
      const t = now()
      const recent = read().filter((stamp) => t - stamp < windowMs)
      if (recent.length >= max) return false
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, JSON.stringify([...recent, t]))
      } catch {
        // cannot record it; allow anyway
      }
      return true
    },
  }
}

module.exports = { createRelaunchGuard }
