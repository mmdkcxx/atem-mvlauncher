import { createCameraController } from './camera-controller.mjs'
import { screenFor } from './screens.mjs'

const mv = window.mv
const $ = (id) => document.getElementById(id)
const MARKS = { done: '✓', now: '◌', todo: '○', fail: '✗' }
const CHIP_MS = 6000
const PANEL_MS = 15000

let atem = { state: 'searching', outputWarning: false }
let cameraStatus = null
let cameraInfo = null
let hadVideo = false
let config = { cameraName: 'ATEM|Blackmagic', cameraMode: null }
let seenCameras = []

const video = $('video')

function render() {
  const screen = screenFor({ atem: atem.state, camera: cameraStatus, outputWarning: atem.outputWarning, hadVideo })
  if (screen.kind === 'video' && !screen.veil) hadVideo = true
  document.body.classList.toggle('show-video', screen.kind === 'video')

  const status = $('status')
  status.hidden = screen.kind !== 'status'
  if (screen.kind === 'status') {
    status.className = `status ${screen.tone}`
    $('status-title').textContent = screen.title
    setText($('status-subtitle'), screen.subtitle)
    setText($('status-hint'), screen.hint)
    const steps = $('status-steps')
    steps.replaceChildren(
      ...(screen.steps ?? []).map((step) => {
        const li = document.createElement('li')
        li.className = step.mark
        li.textContent = `${MARKS[step.mark]} ${step.label}`
        return li
      }),
    )
  }

  $('veil').hidden = !screen.veil
  if (screen.veil) {
    $('veil-title').textContent = screen.veil.title
    $('veil-hint').textContent = screen.veil.hint
  }
  setText($('banner'), screen.banner)
}

function setText(el, text) {
  el.hidden = !text
  el.textContent = text ?? ''
}

let chipTimer = null
function showChip(text) {
  const chip = $('chip')
  chip.textContent = text
  chip.classList.add('show')
  clearTimeout(chipTimer)
  chipTimer = setTimeout(() => chip.classList.remove('show'), CHIP_MS)
}

// Counts the frames a stream really delivers over 3 seconds.
async function measureFps(stream) {
  // Attached to the page (invisible, not display:none) so Chromium keeps presenting frames to it.
  const probe = document.createElement('video')
  probe.muted = true
  probe.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none'
  document.body.append(probe)
  probe.srcObject = stream
  await probe.play().catch(() => {})
  let frames = 0
  let first = 0
  let last = 0
  await new Promise((resolve) => {
    const giveUp = setTimeout(resolve, 6000)
    const tick = (now) => {
      frames++
      if (frames === 1) first = now
      last = now
      if (now - first >= 3000) {
        clearTimeout(giveUp)
        resolve()
      } else {
        probe.requestVideoFrameCallback(tick)
      }
    }
    probe.requestVideoFrameCallback(tick)
  })
  probe.srcObject = null
  probe.remove()
  return last > first ? ((frames - 1) * 1000) / (last - first) : 0
}

function onStream(stream, info) {
  video.srcObject = stream
  cameraInfo = info ?? null
  if (stream) {
    video.play().catch(() => {})
    showChip(`Tersambung · ${info.mode.width}×${info.mode.height} @ ${Math.round(info.measuredFps)} fps`)
  }
  render()
}

// --- maintenance panels (keyboard only) -------------------------------------
let panelTimer = null
async function toggleStatusPanel() {
  const panel = $('panel-status')
  if (!panel.hidden) {
    panel.hidden = true
    return
  }
  const info = await mv.getStatusInfo()
  const mode = cameraInfo
    ? `${cameraInfo.mode.width}×${cameraInfo.mode.height} @ ${Math.round(cameraInfo.measuredFps)} fps`
    : '-'
  $('panel-status-body').textContent = [
    `ATEM    : ${info.state}${info.address ? ` (${info.address})` : ''}`,
    `Kamera  : ${cameraStatus ?? '-'}`,
    `Mode    : ${mode}`,
    `Perangkat kamera: ${seenCameras.length ? seenCameras.map((l) => l || '(tanpa nama)').join(' | ') : '-'}  [cari: ${config.cameraName}]`,
    `Data    : ${info.dataDir} (config.json, app.log)`,
    '',
    ...info.logTail,
  ].join('\n')
  panel.hidden = false
  clearTimeout(panelTimer)
  panelTimer = setTimeout(() => (panel.hidden = true), PANEL_MS)
}

function toggleAddressPanel() {
  const form = $('panel-address')
  const input = $('address-input')
  if (!form.hidden) {
    form.hidden = true
    return
  }
  input.value = ''
  $('address-result').textContent = 'Enter untuk mencoba, Esc untuk batal.'
  form.hidden = false
  input.focus()
}

$('address-input').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('panel-address').hidden = true
})
$('panel-address').addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = $('address-result')
  result.textContent = 'Mencoba…'
  const ok = await mv.submitAddress($('address-input').value).catch(() => false)
  result.textContent = ok ? 'Tersambung. Alamat disimpan.' : 'ATEM tidak menjawab di alamat itu.'
  if (ok) setTimeout(() => ($('panel-address').hidden = true), 2000)
})

mv.onMenu((action) => (action === 'status' ? toggleStatusPanel() : toggleAddressPanel()))
mv.onAtemState((state) => {
  atem = state
  render()
})

// --- start ------------------------------------------------------------------
config = await mv.getConfig()
const camera = createCameraController({
  mediaDevices: navigator.mediaDevices,
  cameraName: config.cameraName,
  getSavedMode: () => config.cameraMode,
  saveMode: (mode) => {
    config.cameraMode = mode
    mv.saveCameraMode(mode)
  },
  measureFps,
  onStatus: (status) => {
    cameraStatus = status
    mv.logCamera(status)
    render()
  },
  onStream,
  onDevices: (labels) => {
    seenCameras = labels
  },
})

const pump = () =>
  video.requestVideoFrameCallback(() => {
    camera.reportFrame()
    pump()
  })
pump()

render()
camera.start()
