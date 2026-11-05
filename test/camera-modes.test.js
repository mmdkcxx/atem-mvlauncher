const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/renderer/camera-modes.mjs')

// Fake camera: `accepts(mode)` decides whether it opens, `delivers(mode)` is the real fps.
function fakeCamera({ accepts, delivers }) {
  const opened = []
  return {
    opened,
    tryOpen: async (mode) => {
      opened.push(mode)
      return accepts(mode)
    },
    measureFps: async (mode) => delivers(mode),
  }
}

const is1080 = (m) => m.width === 1920 && m.height === 1080

test('CANDIDATE_MODES is ordered resolution first, frame rate descending within each', async () => {
  const { CANDIDATE_MODES } = await load()
  assert.deepEqual(CANDIDATE_MODES[0], { width: 3840, height: 2160, frameRate: 60 })
  assert.deepEqual(CANDIDATE_MODES[CANDIDATE_MODES.length - 1], { width: 1280, height: 720, frameRate: 25 })
  assert.equal(CANDIDATE_MODES.length, 12)
  const fps = CANDIDATE_MODES.filter(is1080).map((m) => m.frameRate)
  assert.deepEqual(fps, [60, 50, 30, 25])
})

test('picks 1080p60 when the camera accepts 1080p at every rate and delivers what is asked', async () => {
  const { chooseMode } = await load()
  const cam = fakeCamera({ accepts: is1080, delivers: (m) => m.frameRate })
  const result = await chooseMode({ tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.deepEqual(result.mode, { width: 1920, height: 1080, frameRate: 60 })
  assert.equal(result.measuredFps, 60)
})

test('rejects rates the camera cannot really deliver (accepts 1080p but sends 25 fps)', async () => {
  const { chooseMode } = await load()
  const cam = fakeCamera({ accepts: is1080, delivers: () => 25 })
  const result = await chooseMode({ tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.deepEqual(result.mode, { width: 1920, height: 1080, frameRate: 25 })
})

test('resolution wins over frame rate: 1080p30 is chosen over 720p60', async () => {
  const { chooseMode } = await load()
  const cam = fakeCamera({
    accepts: (m) => m.width <= 1920, // no 4K on this camera
    delivers: (m) => (is1080(m) ? Math.min(m.frameRate, 30) : m.frameRate),
  })
  const result = await chooseMode({ tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.deepEqual(result.mode, { width: 1920, height: 1080, frameRate: 30 })
})

test('a saved mode that still works is used without trying other candidates', async () => {
  const { chooseMode } = await load()
  const saved = { width: 1920, height: 1080, frameRate: 50 }
  const cam = fakeCamera({ accepts: () => true, delivers: (m) => m.frameRate })
  const result = await chooseMode({ saved, tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.deepEqual(result.mode, saved)
  assert.deepEqual(cam.opened, [saved])
})

test('a saved mode that fails falls back to the full ladder without retrying the saved one', async () => {
  const { chooseMode } = await load()
  const saved = { width: 1920, height: 1080, frameRate: 50 }
  const cam = fakeCamera({ accepts: (m) => is1080(m) && m.frameRate !== 50, delivers: (m) => m.frameRate })
  const result = await chooseMode({ saved, tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.deepEqual(result.mode, { width: 1920, height: 1080, frameRate: 60 })
  const savedTries = cam.opened.filter((m) => is1080(m) && m.frameRate === 50)
  assert.equal(savedTries.length, 1)
})

test('returns null when no mode works', async () => {
  const { chooseMode } = await load()
  const cam = fakeCamera({ accepts: () => false, delivers: () => 0 })
  assert.equal(await chooseMode({ tryOpen: cam.tryOpen, measureFps: cam.measureFps }), null)
})

test('a mode that opens but delivers below the tolerance is rejected (default 90%)', async () => {
  const { chooseMode } = await load()
  // 1080p60 delivers 53 (88%) -> rejected; 1080p50 delivers 50 -> accepted
  const cam = fakeCamera({ accepts: is1080, delivers: (m) => (m.frameRate === 60 ? 53 : m.frameRate) })
  const result = await chooseMode({ tryOpen: cam.tryOpen, measureFps: cam.measureFps })
  assert.equal(result.mode.frameRate, 50)
})
