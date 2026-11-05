const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/renderer/screens.mjs')
const base = { atem: 'searching', camera: null, outputWarning: false, hadVideo: false }
const marks = (screen) => screen.steps.map((s) => s.mark)

test('searching: "Menunggu ATEM…" with the ATEM step in progress', async () => {
  const { screenFor } = await load()
  const s = screenFor(base)
  assert.equal(s.kind, 'status')
  assert.equal(s.tone, 'wait')
  assert.equal(s.title, 'Menunggu ATEM…')
  assert.deepEqual(marks(s), ['now', 'todo', 'todo'])
})

test('not-found: "ATEM tidak ditemukan" with a hint about F2', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'not-found' })
  assert.equal(s.tone, 'bad')
  assert.equal(s.title, 'ATEM tidak ditemukan')
  assert.match(s.hint, /F2/)
  assert.match(s.hint, /USB-C/)
})

test('connecting: "Menyambung…"', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'connecting' })
  assert.equal(s.title, 'Menyambung…')
  assert.deepEqual(marks(s), ['now', 'todo', 'todo'])
})

test('checking and setting: output steps are in progress', async () => {
  const { screenFor } = await load()
  const checking = screenFor({ ...base, atem: 'checking' })
  assert.equal(checking.title, 'Memeriksa output…')
  assert.deepEqual(marks(checking), ['done', 'now', 'todo'])
  const setting = screenFor({ ...base, atem: 'setting' })
  assert.equal(setting.title, 'Mengatur output…')
  assert.deepEqual(marks(setting), ['done', 'now', 'todo'])
})

test('ready with the camera opening: "Membuka kamera…" (ATEM and output done, camera now)', async () => {
  const { screenFor } = await load()
  for (const camera of [null, 'opening', 'lost']) {
    const s = screenFor({ ...base, atem: 'ready', camera })
    assert.equal(s.title, 'Membuka kamera…')
    assert.deepEqual(marks(s), ['done', 'done', 'now'])
  }
})

test('camera not-found: hint says the USB-C cable must be plugged into this PC', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'not-found' })
  assert.equal(s.tone, 'bad')
  assert.match(s.hint, /USB-C/)
  assert.deepEqual(marks(s), ['done', 'done', 'fail'])
})

test('camera busy: hint names other applications', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'busy' })
  assert.match(s.title, /dipakai aplikasi lain/)
  assert.match(s.hint, /aplikasi lain/)
})

test('camera blocked: hint mentions the Windows privacy setting and F3', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'blocked' })
  assert.match(s.hint, /Privasi/)
  assert.match(s.hint, /F3/)
})

test('camera ok: a video screen without banner or veil', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'ok' })
  assert.equal(s.kind, 'video')
  assert.equal(s.tone, 'ok')
  assert.equal(s.banner, undefined)
  assert.equal(s.veil, undefined)
})

test('outputWarning while the camera is ok: video with a banner that stays', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'ok', outputWarning: true })
  assert.equal(s.kind, 'video')
  assert.match(s.banner, /Output ATEM belum sesuai/)
})

test('outputWarning on a status screen shows the output step as failed and the banner', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'opening', outputWarning: true })
  assert.deepEqual(marks(s), ['done', 'fail', 'now'])
  assert.ok(s.banner)
})

test('after video was shown, losing the ATEM keeps the video with an "ATEM terputus" veil', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'searching', hadVideo: true })
  assert.equal(s.kind, 'video')
  assert.equal(s.veil.title, 'ATEM terputus')
  assert.match(s.veil.hint, /Menyambung ulang/)
})

test('while reconnecting after a loss the veil says so instead of "terputus"', async () => {
  const { screenFor } = await load()
  for (const atem of ['connecting', 'checking', 'setting']) {
    const s = screenFor({ ...base, atem, hadVideo: true })
    assert.equal(s.kind, 'video')
    assert.equal(s.veil.title, 'Menyambung ulang…')
  }
})

test('camera lost while the ATEM is fine shows the status screen, not a veil', async () => {
  const { screenFor } = await load()
  const s = screenFor({ ...base, atem: 'ready', camera: 'opening', hadVideo: true })
  assert.equal(s.kind, 'status')
  assert.equal(s.veil, undefined)
})

test('an unknown ATEM state falls back to the searching screen', async () => {
  const { screenFor } = await load()
  assert.equal(screenFor({ ...base, atem: 'bogus' }).title, 'Menunggu ATEM…')
})
