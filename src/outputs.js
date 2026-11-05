// Aux 0 = HDMI Out (Program), Aux 1 = Webcam Out (Multi View).
const SOURCE = Object.freeze({ PROGRAM: 10010, MULTIVIEW: 9001 })
const TARGET_AUX = Object.freeze([SOURCE.PROGRAM, SOURCE.MULTIVIEW])

function planAuxFixes(auxilliaries) {
  const fixes = []
  TARGET_AUX.forEach((source, bus) => {
    if (auxilliaries[bus] !== source) fixes.push({ bus, source })
  })
  return fixes
}

function waitForAux(atem, bus, source, ms) {
  return new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer)
      atem.off('stateChanged', onChange)
      resolve(value)
    }
    const onChange = (state, paths) => {
      if (paths.includes(`video.auxilliaries.${bus}`) && state.video.auxilliaries[bus] === source) finish(true)
    }
    const timer = setTimeout(() => finish(false), ms)
    atem.on('stateChanged', onChange)
  })
}

async function applyFix(atem, { bus, source }, confirmMs, attempts) {
  for (let i = 0; i < attempts; i++) {
    const confirmed = waitForAux(atem, bus, source, confirmMs) // listen before sending
    try {
      await atem.setAuxSource(source, bus)
    } catch {
      // fall through: wait out the confirmation window, then retry
    }
    if (await confirmed) return true
  }
  return false
}

async function ensureOutputs(atem, { confirmMs = 3000, attempts = 3, onFixing } = {}) {
  const fixes = planAuxFixes(atem.state?.video?.auxilliaries ?? [])
  if (fixes.length === 0) return { ok: true, fixed: [] }

  if (onFixing) onFixing()
  let ok = true
  for (const fix of fixes) {
    if (!(await applyFix(atem, fix, confirmMs, attempts))) ok = false
  }
  return { ok, fixed: fixes }
}

module.exports = { SOURCE, TARGET_AUX, planAuxFixes, ensureOutputs }
