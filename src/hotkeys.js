const KEY_ACTIONS = { F1: 'status', F2: 'address', F3: 'camera-settings', F11: 'fullscreen' }

function actionForKey({ key, ctrlKey }) {
  if (ctrlKey) return key.toLowerCase() === 'q' ? 'quit-hold' : null
  return KEY_ACTIONS[key] ?? null
}

// Fires `onFire` once after the key has been held for `ms`. Auto-repeat keydowns are
// ignored (no restart, no second fire) until the key is released.
function createHoldDetector(onFire, ms = 2000) {
  let timer = null
  let held = false
  return {
    down() {
      if (held) return
      held = true
      timer = setTimeout(() => {
        timer = null
        onFire()
      }, ms)
    },
    up() {
      held = false
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

module.exports = { actionForKey, createHoldDetector }
