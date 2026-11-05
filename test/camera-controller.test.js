const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/renderer/camera-controller.mjs')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 1500) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return
    await delay(2)
  }
  throw new Error('timed out waiting for condition')
}
const domError = (name) => Object.assign(new Error(name), { name })

function fakeStream(settings = { width: 1920, height: 1080, frameRate: 60 }) {
  const handlers = []
  const track = {
    stopped: false,
    stop() {
      track.stopped = true
    },
    addEventListener: (type, fn) => type === 'ended' && handlers.push(fn),
    removeEventListener: () => {},
    getSettings: () => settings,
    end: () => handlers.forEach((fn) => fn()),
  }
  return { track, getVideoTracks: () => [track], getTracks: () => [track] }
}

const ATEM = { kind: 'videoinput', deviceId: 'cam1', label: 'ATEM Mini Pro (Blackmagic Design)' }

// `getUserMedia(constraints)` default: accept up to 1080p, otherwise a fresh stream.
function setup({ devices, getUserMedia, getSavedMode = () => null, timings = {} } = {}) {
  const listeners = new Set()
  const streams = []
  const statuses = []
  const onStreamCalls = []
  const saved = []
  const media = {
    calls: [],
    inFlight: 0,
    maxInFlight: 0,
    deviceList: devices ?? [ATEM],
    enumerateDevices: async () => (typeof media.deviceList === 'function' ? media.deviceList() : media.deviceList),
    getUserMedia: async (constraints) => {
      media.calls.push(constraints)
      media.inFlight++
      media.maxInFlight = Math.max(media.maxInFlight, media.inFlight)
      try {
        if (getUserMedia) return await getUserMedia(constraints, streams)
        const w = constraints.video?.width?.exact
        if (w && w > 1920) throw domError('OverconstrainedError')
        const s = fakeStream()
        streams.push(s)
        return s
      } finally {
        media.inFlight--
      }
    },
    addEventListener: (type, fn) => type === 'devicechange' && listeners.add(fn),
    removeEventListener: (type, fn) => listeners.delete(fn),
    fire: () => listeners.forEach((fn) => fn()),
  }
  const deps = {
    mediaDevices: media,
    cameraName: 'ATEM Mini Pro',
    getSavedMode,
    saveMode: (m) => saved.push(m),
    measureFps: async (stream, mode) => mode.frameRate,
    onStatus: (s) => statuses.push(s),
    onStream: (s, info) => onStreamCalls.push({ stream: s, info }),
    timings: { retryMs: 15, stallMs: 60, ...timings },
  }
  return { media, deps, streams, statuses, onStreamCalls, saved }
}

test('finds the device by case-insensitive partial name, opens it and reports ok', async () => {
  const { createCameraController } = await load()
  const t = setup({ devices: [{ kind: 'videoinput', deviceId: 'x', label: 'Integrated Webcam' }, { ...ATEM, label: 'atem mini pro (usb)' }] })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  assert.deepEqual(t.statuses.slice(0, 2), ['opening', 'ok'])
  const last = t.onStreamCalls[t.onStreamCalls.length - 1]
  assert.deepEqual(last.info.mode, { width: 1920, height: 1080, frameRate: 60 })
  assert.deepEqual(t.saved, [{ width: 1920, height: 1080, frameRate: 60 }])
  const mediaCall = t.media.calls.find((c) => c.video?.deviceId)
  assert.equal(mediaCall.video.deviceId.exact, 'cam1')
  cam.stop()
})

test('not-found when no device matches, and keeps retrying until it appears', async () => {
  const { createCameraController } = await load()
  const t = setup({ devices: [{ kind: 'videoinput', deviceId: 'x', label: 'Integrated Webcam' }] })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('not-found'))
  t.media.deviceList = [ATEM]
  await until(() => t.statuses.includes('ok'))
  assert.equal(t.statuses.filter((s) => s === 'not-found').length, 1, 'status is not re-announced on every retry')
  cam.stop()
})

test('NotReadableError means busy', async () => {
  const { createCameraController } = await load()
  const t = setup({
    getUserMedia: async () => {
      throw domError('NotReadableError')
    },
  })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('busy'))
  cam.stop()
})

test('NotAllowedError means blocked', async () => {
  const { createCameraController } = await load()
  const t = setup({
    getUserMedia: async () => {
      throw domError('NotAllowedError')
    },
  })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('blocked'))
  cam.stop()
})

test('empty device labels: asks for permission once, stops that probe stream, searches again and opens', async () => {
  const { createCameraController } = await load()
  let granted = false
  const probes = []
  const t = setup({
    getUserMedia: async (c) => {
      const s = fakeStream()
      if (c.video === true) {
        granted = true
        probes.push(s)
      }
      return s
    },
  })
  t.media.deviceList = () => [{ ...ATEM, label: granted ? ATEM.label : '' }]
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  assert.equal(t.media.calls.filter((c) => c.video === true).length, 1)
  assert.equal(probes[0].track.stopped, true)
  cam.stop()
})

test('empty labels and permission refused means blocked', async () => {
  const { createCameraController } = await load()
  const t = setup({
    getUserMedia: async () => {
      throw domError('NotAllowedError')
    },
  })
  t.media.deviceList = [{ ...ATEM, label: '' }]
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('blocked'))
  cam.stop()
})

test('three devicechange events during an attempt never run two attempts at once', async () => {
  const { createCameraController } = await load()
  const t = setup({
    getUserMedia: async (c, streams) => {
      await delay(20)
      const w = c.video?.width?.exact
      if (w && w > 1920) throw domError('OverconstrainedError')
      const s = fakeStream()
      streams.push(s)
      return s
    },
  })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.media.calls.length >= 1)
  t.media.fire()
  t.media.fire()
  t.media.fire()
  await until(() => t.statuses.includes('ok'))
  await delay(80)
  assert.equal(t.media.maxInFlight, 1)
  cam.stop()
})

test('track ended: lost, onStream(null), then the camera is reopened', async () => {
  const { createCameraController } = await load()
  const t = setup()
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  const first = t.streams[t.streams.length - 1]
  first.track.end()
  await until(() => t.statuses.filter((s) => s === 'ok').length >= 2)
  assert.ok(t.statuses.includes('lost'))
  assert.ok(t.onStreamCalls.some((c) => c.stream === null))
  cam.stop()
})

test('no frames for stallMs after ok: lost and reopened; steady frames keep it ok', async () => {
  const { createCameraController } = await load()
  const t = setup({ timings: { stallMs: 50 } })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  const feeder = setInterval(() => cam.reportFrame(), 10)
  await delay(160)
  clearInterval(feeder)
  assert.ok(!t.statuses.includes('lost'), 'steady frames must not look like a stall')
  await until(() => t.statuses.includes('lost'))
  await until(() => t.statuses.filter((s) => s === 'ok').length >= 2)
  cam.stop()
})

test('falls back to the default mode when no candidate mode is accepted', async () => {
  const { createCameraController } = await load()
  const t = setup({
    getUserMedia: async (c, streams) => {
      if (c.video?.width) throw domError('OverconstrainedError')
      const s = fakeStream({ width: 1280, height: 720, frameRate: 30 })
      streams.push(s)
      return s
    },
  })
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  const last = t.onStreamCalls[t.onStreamCalls.length - 1]
  assert.deepEqual(last.info.mode, { width: 1280, height: 720, frameRate: 30 })
  cam.stop()
})

test('stop closes the stream and no more statuses are reported', async () => {
  const { createCameraController } = await load()
  const t = setup()
  const cam = createCameraController(t.deps)
  cam.start()
  await until(() => t.statuses.includes('ok'))
  const stream = t.streams[t.streams.length - 1]
  cam.stop()
  assert.equal(stream.track.stopped, true)
  const count = t.statuses.length
  stream.track.end()
  await delay(60)
  assert.equal(t.statuses.length, count)
})

test('cameraName accepts alternatives separated by |, and ignores virtual cameras', async () => {
  const { createCameraController } = await load()
  // Windows lists the ATEM video interface as "Blackmagic Design"; "ATEM Mini Pro" is only its audio side.
  const t = setup({
    devices: [
      { kind: 'videoinput', deviceId: 'ndi', label: 'NDI Webcam Video (ffff:0001)' },
      { kind: 'videoinput', deviceId: 'bm', label: 'Blackmagic Design (1edb:be55)' },
    ],
  })
  const cam = createCameraController({ ...t.deps, cameraName: 'ATEM Mini Pro|Blackmagic' })
  cam.start()
  await until(() => t.statuses.includes('ok'))
  const open = t.media.calls.find((c) => c.video?.deviceId)
  assert.equal(open.video.deviceId.exact, 'bm')
  cam.stop()
})

test('an earlier alternative wins over a later one when several devices match', async () => {
  const { createCameraController } = await load()
  const t = setup({
    devices: [
      { kind: 'videoinput', deviceId: 'bm', label: 'Blackmagic Design' },
      { kind: 'videoinput', deviceId: 'atem', label: 'ATEM Mini Pro' },
    ],
  })
  const cam = createCameraController({ ...t.deps, cameraName: 'ATEM|Blackmagic' })
  cam.start()
  await until(() => t.statuses.includes('ok'))
  assert.equal(t.media.calls.find((c) => c.video?.deviceId).video.deviceId.exact, 'atem')
  cam.stop()
})

test('onDevices reports the camera labels seen, so a wrong name can be diagnosed', async () => {
  const { createCameraController } = await load()
  const seen = []
  const t = setup({ devices: [{ kind: 'videoinput', deviceId: 'x', label: 'Integrated Webcam' }, { kind: 'audioinput', deviceId: 'a', label: 'Mic' }] })
  const cam = createCameraController({ ...t.deps, onDevices: (labels) => seen.push(labels) })
  cam.start()
  await until(() => t.statuses.includes('not-found'))
  assert.deepEqual(seen[0], ['Integrated Webcam'])
  cam.stop()
})
