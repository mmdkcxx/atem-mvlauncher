import { chooseMode } from './camera-modes.mjs'

const DEFAULT_TIMINGS = { retryMs: 3000, stallMs: 5000 }

class DeviceNotFoundError extends Error {
  name = 'NotFoundError'
}

function statusForError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'blocked'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'not-found' // NotFoundError, DevicesNotFoundError and anything unexpected
  }
}

const isOverconstrained = (err) => err?.name === 'OverconstrainedError' || err?.name === 'ConstraintNotSatisfiedError'
const stopStream = (stream) => stream?.getTracks().forEach((track) => track.stop())

// Statuses: 'opening' | 'ok' | 'not-found' | 'busy' | 'blocked' | 'lost'.
// Only one open attempt runs at a time; a status is announced only when it changes.
export function createCameraController({
  mediaDevices,
  cameraName,
  getSavedMode,
  saveMode,
  measureFps,
  onStatus,
  onStream,
  onDevices,
  timings,
}) {
  const t = { ...DEFAULT_TIMINGS, ...timings }
  let running = false
  let attempting = false
  let pendingChange = false
  let status = null
  let retryTimer = null
  let stallTimer = null
  let lastFrameAt = 0
  let current = null // the stream being shown
  let candidate = null // a stream opened while probing modes

  const setStatus = (next) => {
    if (!running || next === status) return
    status = next
    onStatus(next)
  }

  const closeCandidate = () => {
    stopStream(candidate)
    candidate = null
  }

  async function findDevice() {
    const listVideo = async () => (await mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
    let devices = await listVideo()
    // Labels stay empty until the page has camera permission: ask once, then look again.
    if (devices.length > 0 && devices.every((d) => !d.label)) {
      stopStream(await mediaDevices.getUserMedia({ video: true }))
      devices = await listVideo()
    }
    onDevices?.(devices.map((d) => d.label))
    // cameraName holds alternatives separated by "|"; an earlier alternative wins.
    const needles = cameraName.split('|').map((n) => n.trim().toLowerCase()).filter(Boolean)
    let match
    for (const needle of needles) {
      match = devices.find((d) => d.label.toLowerCase().includes(needle))
      if (match) break
    }
    if (!match) throw new DeviceNotFoundError(`no camera matching "${cameraName}"`)
    return match
  }

  async function openBestMode(device) {
    const open = (video) => mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId }, ...video } })
    const result = await chooseMode({
      saved: getSavedMode(),
      tryOpen: async (mode) => {
        closeCandidate()
        try {
          candidate = await open({
            width: { exact: mode.width },
            height: { exact: mode.height },
            frameRate: { exact: mode.frameRate },
          })
          return true
        } catch (err) {
          if (isOverconstrained(err)) return false
          throw err
        }
      },
      measureFps: (mode) => measureFps(candidate, mode),
    })
    if (result) {
      const stream = candidate
      candidate = null
      return { stream, mode: result.mode, measuredFps: result.measuredFps, fromLadder: true }
    }
    closeCandidate()
    // No listed mode worked: take whatever the camera offers by default.
    const stream = await open({})
    const s = stream.getVideoTracks()[0].getSettings()
    return { stream, mode: { width: s.width, height: s.height, frameRate: s.frameRate }, measuredFps: s.frameRate, fromLadder: false }
  }

  function adopt(opened) {
    const stream = opened.stream
    current = stream
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (running && stream === current) loseCurrent()
    })
    lastFrameAt = Date.now()
    stallTimer = setInterval(() => {
      if (Date.now() - lastFrameAt > t.stallMs) loseCurrent()
    }, Math.max(5, Math.floor(t.stallMs / 4)))
    if (opened.fromLadder) saveMode(opened.mode)
    setStatus('ok')
    onStream(stream, { mode: opened.mode, measuredFps: opened.measuredFps })
  }

  function loseCurrent() {
    clearInterval(stallTimer)
    stallTimer = null
    stopStream(current)
    current = null
    setStatus('lost')
    onStream(null)
    attempt()
  }

  async function attempt() {
    if (!running) return
    if (attempting) {
      pendingChange = true
      return
    }
    attempting = true
    clearTimeout(retryTimer)
    try {
      if (status === null || status === 'ok' || status === 'lost') setStatus('opening')
      const device = await findDevice()
      const opened = await openBestMode(device)
      if (!running) {
        stopStream(opened.stream)
        return
      }
      adopt(opened)
    } catch (err) {
      closeCandidate()
      if (running) {
        setStatus(statusForError(err))
        retryTimer = setTimeout(attempt, t.retryMs)
      }
    } finally {
      attempting = false
      const again = pendingChange && running && status !== 'ok'
      pendingChange = false
      if (again) attempt()
    }
  }

  const onDeviceChange = () => {
    if (status !== 'ok') attempt()
  }

  return {
    start() {
      if (running) return
      running = true
      mediaDevices.addEventListener('devicechange', onDeviceChange)
      attempt()
    },
    stop() {
      running = false
      clearTimeout(retryTimer)
      clearInterval(stallTimer)
      mediaDevices.removeEventListener('devicechange', onDeviceChange)
      stopStream(current)
      closeCandidate()
      current = null
    },
    reportFrame() {
      lastFrameAt = Date.now()
    },
  }
}
