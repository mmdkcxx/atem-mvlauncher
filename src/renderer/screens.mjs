// Pure mapping from (ATEM state, camera status) to what the screen shows. No DOM here.
// ATEM states come from the supervisor; camera statuses from the camera controller.

const LABELS = { atem: 'ATEM Mini Pro', output: 'Output HDMI dan Webcam', camera: 'Kamera UVC' }
const OUTPUT_BANNER = 'Output ATEM belum sesuai · mencoba lagi'

function steps(atem, output, camera) {
  return [
    { label: LABELS.atem, mark: atem },
    { label: LABELS.output, mark: output },
    { label: LABELS.camera, mark: camera },
  ]
}

function statusScreen({ tone, title, subtitle, steps: stepList, hint, banner }) {
  const screen = { kind: 'status', tone, title, steps: stepList }
  if (subtitle) screen.subtitle = subtitle
  if (hint) screen.hint = hint
  if (banner) screen.banner = banner
  return screen
}

const CAMERA_PROBLEMS = {
  'not-found': {
    title: 'Kamera ATEM tidak terlihat',
    hint: 'Colok kabel USB-C ke PC ini. Kontrol lewat Ethernet saja tidak mengirim gambar.',
  },
  busy: {
    title: 'Kamera dipakai aplikasi lain',
    hint: 'Tutup OBS, Zoom, Teams, atau aplikasi lain yang memakai kamera. Mencoba lagi tiap 3 detik.',
  },
  blocked: {
    title: 'Windows memblokir kamera',
    hint: 'Buka Pengaturan Windows → Privasi & keamanan → Kamera, lalu aktifkan "Biarkan aplikasi desktop mengakses kamera". Perawatan dengan keyboard: tekan F3 untuk membuka pengaturan itu.',
  },
}

function veilFor(atem) {
  if (atem === 'connecting' || atem === 'checking' || atem === 'setting') {
    return { title: 'Menyambung ulang…', hint: 'Memeriksa kamera dan output ATEM' }
  }
  return { title: 'ATEM terputus', hint: 'Menyambung ulang… kamera dan output akan dicek lagi' }
}

export function screenFor({ atem, camera, outputWarning, hadVideo }) {
  const banner = outputWarning ? OUTPUT_BANNER : undefined

  if (atem === 'ready' && camera === 'ok') {
    const screen = { kind: 'video', tone: 'ok', title: 'Multiview' }
    if (banner) screen.banner = banner
    return screen
  }

  if (hadVideo && atem !== 'ready') {
    const screen = { kind: 'video', tone: 'bad', title: 'Multiview', veil: veilFor(atem) }
    if (banner) screen.banner = banner
    return screen
  }

  switch (atem) {
    case 'not-found':
      return statusScreen({
        tone: 'bad',
        title: 'ATEM tidak ditemukan',
        steps: steps('fail', 'todo', 'todo'),
        hint: 'Cek kabel USB-C dan pastikan ATEM menyala. Masih mencoba… Perawatan dengan keyboard: tekan F2 untuk mengisi alamat.',
      })
    case 'connecting':
      return statusScreen({ tone: 'wait', title: 'Menyambung…', steps: steps('now', 'todo', 'todo') })
    case 'checking':
      return statusScreen({ tone: 'wait', title: 'Memeriksa output…', steps: steps('done', 'now', 'todo') })
    case 'setting':
      return statusScreen({ tone: 'wait', title: 'Mengatur output…', steps: steps('done', 'now', 'todo') })
    case 'ready': {
      const output = outputWarning ? 'fail' : 'done'
      const problem = CAMERA_PROBLEMS[camera]
      if (problem) {
        return statusScreen({ tone: 'bad', ...problem, steps: steps('done', output, 'fail'), banner })
      }
      return statusScreen({ tone: 'wait', title: 'Membuka kamera…', steps: steps('done', output, 'now'), banner })
    }
    default:
      return statusScreen({ tone: 'wait', title: 'Menunggu ATEM…', steps: steps('now', 'todo', 'todo') })
  }
}
