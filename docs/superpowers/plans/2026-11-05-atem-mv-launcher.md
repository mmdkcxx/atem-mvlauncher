# ATEM MV Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi Electron kiosk di Windows yang mengatur output ATEM Mini Pro (HDMI Out = Program, Webcam Out = Multi View) dan menampilkan video UVC Webcam Out layar penuh, pulih sendiri dari putus koneksi.

**Architecture:** Logika dipisah dari Electron supaya bisa diuji di WSL dengan `node --test`. Proses utama (CommonJS) memegang pengawas koneksi ATEM (`supervisor`), pencarian alamat, config, dan log. Renderer (ES module `.mjs`) memegang pembukaan kamera UVC, pemilihan mode, dan pemetaan keadaan ke layar. Keduanya bertukar keadaan lewat IPC; fungsi `screenFor` menggabungkan keadaan ATEM dan kamera menjadi satu layar.

**Tech Stack:** Node 22, Electron (versi stabil terbaru saat dikerjakan, dipin persis), `atem-connection` 3.10.3, `node:test`, `electron-builder`.

**Spec:** `docs/superpowers/specs/2026-11-05-atem-mv-launcher-design.md` (storyboard: https://claude.ai/artifact/LZtvyC3XHwMTQJBCN9UhPn)

## Global Constraints

- Aux 0 = HDMI Out, target Program (source `10010`). Aux 1 = Webcam Out, target Multi View (source `9001`).
- Pengaturan Aux hanya dicek saat koneksi baru terbentuk. Tidak ada pemaksaan terus-menerus; hanya yang salah yang diubah; Aux yang sudah benar tidak mengirim perintah.
- Pencarian ATEM berurutan: alamat terakhir → pasangan alamat adapter `/30` → F2 menguji alamat sebelum disimpan sebagai alamat terakhir.
- Waktu default: 20 dtk sebelum "tidak ditemukan", 5 dtk batas menyambung, 3 dtk konfirmasi Aux (maks 3 kali), 30 dtk ulang pengaturan Aux yang gagal, 3 dtk jeda coba ulang (pencarian dan kamera), 5 dtk gambar macet.
- Kamera dipilih berdasarkan nama perangkat (default `"ATEM Mini Pro"`, dugaan, diverifikasi di Task 13).
- Mode UVC: resolusi tertinggi dulu, lalu frame rate tertinggi di resolusi itu. Kandidat: 3840×2160, 1920×1080, 1280×720 × 60, 50, 30, 25 fps. Ditolak bila frame terukur selama 3 dtk kurang dari 90% dari yang diminta.
- Tidak ada elemen yang bisa diklik. Tombol perawatan hanya: F1 status (menutup sendiri 15 dtk), F2 alamat manual, F3 pengaturan kamera Windows (`ms-settings:privacy-webcam`), F11 layar penuh, Ctrl+Q ditahan 2 dtk keluar.
- Layar penuh sejak awal, kursor tersembunyi, PC tidak boleh tidur, satu instance saja.
- Semua teks yang tampil di layar dalam bahasa Indonesia.
- Test logika memakai `node:test` (`node --test`), tanpa dependensi uji tambahan. Di WSL, `export PATH=$HOME/.local/node/bin:$PATH` dulu.
- Hasil akhirnya satu installer Windows (`Setup.exe`, NSIS) yang membawa Electron dan Node di dalamnya. Mini PC tujuan tidak memerlukan Node atau perangkat lunak lain; Node 22 hanya dibutuhkan di satu PC Windows pembangun.
- Verifikasi Electron dilakukan di Windows (butuh Node 22 di PC pembangun). Salin repo ke sisi Windows: `git clone \\wsl$\<distro>\home\doh_rog\atem-mvlauncher C:\atem-mvlauncher`, lalu `git pull` untuk pembaruan.

## Review Focus

1. Berkas config kosong, rusak, atau hilang: aplikasi tetap jalan dengan nilai bawaan dan tidak crash (Task 1).
2. Ada beberapa adapter `/30` (VPN, virtual) yang bukan ATEM: semua kandidat dicoba, tiap kandidat dibatasi 5 dtk, pencarian tidak berhenti di kandidat pertama yang gagal (Task 3 dan 4).
3. ATEM putus di tengah pengaturan Aux: kembali mencari, tidak ada penolakan promise yang tak tertangani, tidak ada ATEM lama yang tertinggal hidup (Task 4).
4. Nama perangkat kamera kosong sebelum izin diberikan (`enumerateDevices` tanpa label): izin dipicu dulu lalu perangkat dicari ulang; izin ditolak → status `blocked` (Task 6).
5. Event `devicechange` ganda atau pencobaan buka kamera bersamaan: hanya satu percobaan berjalan pada satu waktu (Task 6).

---

### Task 1: Scaffold, test runner, dan config

**Files:**
- Modify: `package.json` (tambah `"main": "src/main.js"`, skrip `test`: `node --test`, `start`: `electron .`)
- Create: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_CONFIG = { lastAddress: null, cameraName: 'ATEM Mini Pro', cameraMode: null }` (`cameraMode: {width:number,height:number,frameRate:number}|null`)
  - `loadConfig(filePath: string): Config`
  - `saveConfig(filePath: string, config: Config): void` (tulis atomik: berkas sementara lalu rename)
  - `updateConfig(filePath: string, patch: Partial<Config>): Config`

- [ ] **Step 1: Tulis test `test/config.test.js`**: `loadConfig` berkas hilang → `DEFAULT_CONFIG`; berkas kosong → default; JSON rusak → default **dan** berkas diganti nama `<file>.corrupt-<timestamp>` (cek berkas lama tidak ada, berkas `.corrupt-*` ada); `updateConfig(f, {lastAddress:'172.28.8.201'})` lalu `loadConfig(f).lastAddress === '172.28.8.201'` dengan field lain tetap default. Pakai `fs.mkdtempSync` untuk folder sementara.
- [ ] **Step 2: Jalankan `npm test`**. Expected: FAIL (modul belum ada).
- [ ] **Step 3: Implementasikan `src/config.js`** sesuai signature di atas.
- [ ] **Step 4: Jalankan `npm test`**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: scaffold test runner and config store`

### Task 2: Target output dan penegak Aux

**Files:**
- Create: `src/outputs.js`
- Test: `test/outputs.test.js`

**Interfaces:**
- Produces:
  - `SOURCE = { PROGRAM: 10010, MULTIVIEW: 9001 }`; `TARGET_AUX = [SOURCE.PROGRAM, SOURCE.MULTIVIEW]` (indeks = bus Aux)
  - `planAuxFixes(auxilliaries: Array<number|undefined>): Array<{bus:number, source:number}>`
  - `ensureOutputs(atem: AtemLike, opts?: {confirmMs?:number, attempts?:number, onFixing?:()=>void}): Promise<{ok:boolean, fixed:Array<{bus:number,source:number}>}>`
  - `AtemLike`: EventEmitter dengan `state.video.auxilliaries`, `setAuxSource(source:number, bus:number): Promise<unknown>`, dan event `stateChanged(state, paths:string[])` (path `video.auxilliaries.<bus>` menandakan perubahan).

- [ ] **Step 1: Tulis test**: `planAuxFixes([9001,10010])` (keadaan setelah restart) → `[{bus:0,source:10010},{bus:1,source:9001}]`; `planAuxFixes([10010,9001])` → `[]`; `planAuxFixes([10010,10010])` → hanya `{bus:1,source:9001}`; `planAuxFixes([])` → kedua Aux. Dengan ATEM tiruan: `ensureOutputs` pada Aux yang sudah benar tidak memanggil `setAuxSource` dan mengembalikan `{ok:true, fixed:[]}`; pada Aux salah memanggil `setAuxSource(10010,0)` dan `(9001,1)`, memanggil `onFixing` sekali, dan `ok:true` setelah tiruan memancarkan `stateChanged` dengan path yang cocok; bila tiruan tidak pernah mengonfirmasi, `setAuxSource` dipanggil 3 kali per bus (dengan `confirmMs` kecil) lalu `ok:false`.
- [ ] **Step 2: Jalankan `node --test test/outputs.test.js`**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `src/outputs.js`.** Konfirmasi = menunggu `stateChanged` yang memuat path bus terkait *dan* nilai `state.video.auxilliaries[bus]` sudah sama dengan target; batas waktu `confirmMs` (default 3000), `attempts` default 3.
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: output targets and aux enforcement`

### Task 3: Kandidat alamat ATEM

**Files:**
- Create: `src/discovery.js`
- Test: `test/discovery.test.js`

**Interfaces:**
- Produces:
  - `peerAddresses(ifaces: ReturnType<typeof os.networkInterfaces>): string[]` (adapter IPv4, bukan internal, netmask `255.255.255.252`; kembalikan alamat host lain di subnet `/30`)
  - `candidateAddresses(args:{config:Config, ifaces:ReturnType<typeof os.networkInterfaces>}): Array<{address:string, via:'last'|'usb'}>` (urutan: `lastAddress` dulu, lalu pasangan USB, tanpa duplikat)

- [ ] **Step 1: Tulis test** dengan data `ifaces` palsu: adapter `172.28.8.202/255.255.255.252` → `['172.28.8.201']`; kebalikannya (`.201` → `.202`); `192.168.13.44/255.255.255.0` diabaikan; alamat internal (`127.0.0.1`) diabaikan; dua adapter `/30` → dua alamat; `candidateAddresses` dengan `lastAddress:'172.28.8.201'` dan pasangan USB yang sama → satu entri `via:'last'`; `lastAddress:null` → hanya entri `usb`.
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `src/discovery.js`** (hitung subnet dengan operasi bit pada oktet).
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: atem address candidates`

### Task 4: Pengawas koneksi ATEM (`supervisor`)

**Files:**
- Create: `src/supervisor.js`
- Test: `test/supervisor.test.js`

**Interfaces:**
- Consumes: `ensureOutputs` (Task 2), `candidateAddresses` (Task 3) lewat dependensi yang disuntikkan.
- Produces:
  - `createSupervisor(deps:{createAtem:()=>AtemLike & {connect(address:string):Promise<void>, disconnect():Promise<void>, destroy?():Promise<void>}, getCandidates:()=>Promise<Array<{address:string, via:string}>>, ensureOutputs:typeof ensureOutputs, onConnected:(address:string)=>void, timings?:Partial<{connectMs:number, notFoundAfterMs:number, retryMs:number, outputRetryMs:number}>}): Supervisor`
  - `Supervisor` (EventEmitter): `start():void`, `stop():Promise<void>`, `tryAddress(address:string):Promise<boolean>` (untuk F2: menyambung, bila berhasil memanggil `onConnected` dan lanjut alur normal). Memancarkan `'state'` dengan `{state:'searching'|'not-found'|'connecting'|'checking'|'setting'|'ready', address?:string, outputWarning:boolean}`.

- [ ] **Step 1: Tulis test** (ATEM tiruan, `mock.timers` dari `node:test`): (a) kandidat pertama tidak menjawab dalam `connectMs` → kandidat kedua dicoba; (b) tersambung → urutan state `connecting`, `checking`, `ready` dan `onConnected(address)` dipanggil; (c) bila `ensureOutputs` memanggil `onFixing`, state `setting` dipancarkan sebelum `ready`; (d) `ensureOutputs` mengembalikan `ok:false` → `ready` dengan `outputWarning:true`, lalu `ensureOutputs` dipanggil lagi tiap `outputRetryMs`; (e) tanpa hasil selama `notFoundAfterMs` → state `not-found`, dan pencarian tetap berlanjut (kandidat baru tetap dicoba setelahnya); (f) event `disconnected` saat `ready` → state `searching`, ATEM lama di-`destroy` (atau `disconnect`), ATEM baru dibuat, dan `ensureOutputs` dipanggil lagi saat tersambung; (g) **fokus ulasan 3:** `disconnected` terjadi saat `ensureOutputs` belum selesai (promise yang ditolak setelahnya) → kembali `searching`, tidak ada unhandled rejection (`process.on('unhandledRejection')` diawasi dalam test); (h) **fokus ulasan 2:** tiga kandidat gagal berturut-turut, semuanya dicoba sebelum menunggu `retryMs`; (i) `tryAddress` ke alamat yang menjawab → `true` dan `onConnected` dipanggil, ke alamat yang tidak menjawab → `false` tanpa mengubah koneksi yang ada.
- [ ] **Step 2: Jalankan `node --test test/supervisor.test.js`**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `src/supervisor.js`.** Satu instance ATEM baru per percobaan, di-destroy saat gagal atau putus (jangan mengandalkan auto-reconnect bawaan `atem-connection`; verifikasi perilakunya saat implementasi). Setiap percobaan dibungkus batas waktu `connectMs` (`Promise.race`), dan hasil yang datang terlambat diabaikan.
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: atem connection supervisor`

### Task 5: Pemilih mode UVC

**Files:**
- Create: `src/renderer/camera-modes.mjs`
- Test: `test/camera-modes.test.js` (impor dinamis `.mjs`)

**Interfaces:**
- Produces:
  - `CANDIDATE_MODES: Array<{width:number,height:number,frameRate:number}>` (urut: resolusi menurun, di dalamnya frame rate menurun)
  - `chooseMode(args:{candidates?:Mode[], saved?:Mode|null, tryOpen:(mode:Mode)=>Promise<boolean>, measureFps:(mode:Mode)=>Promise<number>, tolerance?:number}): Promise<{mode:Mode, measuredFps:number}|null>` (default `tolerance` 0.9)

- [ ] **Step 1: Tulis test**: `CANDIDATE_MODES[0]` adalah 3840×2160@60 dan elemen terakhir 1280×720@25; kamera tiruan hanya menerima 1920×1080 (semua fps) dengan fps terukur sama dengan yang diminta → hasil 1920×1080@60; kamera menerima 1080p tapi hanya mengirim 25 fps nyata → 1080p@60/50/30 ditolak karena <90%, hasil 1080p@25; kamera yang 1080p-nya hanya 30 fps tapi 720p sampai 60 → hasil 1080p@30 (resolusi didahulukan); mode tersimpan yang masih lolos dipakai tanpa memanggil `tryOpen` untuk kandidat lain; mode tersimpan yang gagal → tangga penuh; tidak ada yang lolos → `null`.
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `camera-modes.mjs`.**
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: uvc mode selection`

### Task 6: Pengendali kamera

**Files:**
- Create: `src/renderer/camera-controller.mjs`
- Test: `test/camera-controller.test.js`

**Interfaces:**
- Consumes: `chooseMode` (Task 5).
- Produces:
  - `createCameraController(deps:{mediaDevices:MediaDevicesLike, cameraName:string, getSavedMode:()=>Mode|null, saveMode:(m:Mode)=>void, measureFps:(stream:MediaStream, mode:Mode)=>Promise<number>, onStatus:(s:CameraStatus)=>void, onStream:(s:MediaStream|null, info?:{mode:Mode, measuredFps:number})=>void, timings?:Partial<{retryMs:number, stallMs:number}>}): {start():void, stop():void, reportFrame():void}`
  - `CameraStatus = 'opening'|'ok'|'not-found'|'busy'|'blocked'|'lost'`
  - `MediaDevicesLike`: `enumerateDevices()`, `getUserMedia(constraints)`, `addEventListener('devicechange', fn)`/`removeEventListener`.

- [ ] **Step 1: Tulis test** dengan `mediaDevices` tiruan: perangkat bernama "ATEM Mini Pro (…)" ditemukan dengan pencocokan sebagian, tidak peka huruf besar → status `opening` lalu `ok`, `onStream` dipanggil dengan info mode, `saveMode` dipanggil; tidak ada perangkat cocok → `not-found`, dicoba lagi tiap `retryMs`; `getUserMedia` menolak dengan `NotReadableError` → `busy`; dengan `NotAllowedError` → `blocked`; **fokus ulasan 4:** `enumerateDevices` mengembalikan perangkat dengan label kosong → controller memanggil `getUserMedia({video:true})` sekali untuk memicu izin, menghentikan track-nya, lalu mencari ulang dan sukses; bila itu ditolak `NotAllowedError` → `blocked`; **fokus ulasan 5:** tiga event `devicechange` beruntun saat satu percobaan berjalan → `getUserMedia` untuk pembukaan kamera hanya satu percobaan berjalan pada satu waktu; track berakhir (`ended`) → `lost`, `onStream(null)`, lalu pembukaan ulang; `reportFrame` tidak dipanggil selama `stallMs` setelah `ok` → diperlakukan `lost` dan dibuka ulang.
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `camera-controller.mjs`.** Pemetaan error: `NotFoundError`/tanpa perangkat → `not-found`; `NotReadableError`/`TrackStartError` → `busy`; `NotAllowedError`/`SecurityError` → `blocked`. Pakai satu penanda "percobaan berjalan" untuk menolak percobaan ganda.
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: camera controller`

### Task 7: Pemetaan keadaan ke layar

**Files:**
- Create: `src/renderer/screens.mjs`
- Test: `test/screens.test.js`

**Interfaces:**
- Produces:
  - `screenFor(input:{atem:AtemState, camera:CameraStatus|null, outputWarning:boolean, hadVideo:boolean}): Screen`
  - `Screen = {kind:'status'|'video', tone:'wait'|'ok'|'bad', title:string, subtitle?:string, steps?:Array<{label:string, mark:'done'|'now'|'todo'|'fail'}>, hint?:string, banner?:string, veil?:{title:string, hint:string}}`
  - `AtemState` sama dengan state Task 4.

- [ ] **Step 1: Tulis test** satu per layar storyboard: `searching` → judul "Menunggu ATEM…" dengan langkah ATEM `now`; `not-found` → "ATEM tidak ditemukan" dengan hint memuat "F2"; `connecting` → "Menyambung…"; `checking`/`setting` → layar cek/atur output; `ready` + `camera:'opening'` → "Membuka kamera…" (ATEM dan output `done`, kamera `now`); `ready` + `camera:'not-found'` → hint menyebut "USB-C"; `busy` → hint menyebut "aplikasi lain"; `blocked` → hint memuat "F3"; `ready` + `camera:'ok'` → `kind:'video'`; `outputWarning:true` saat `ok` → `banner` terisi; `hadVideo:true` dengan `atem:'searching'` → `kind:'video'` dengan `veil.title === 'ATEM terputus'`. Cek semua string berbahasa Indonesia sesuai storyboard (patokan isi, bukan salinan akhir).
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `screens.mjs`** (fungsi murni, tanpa DOM).
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: screen view model`

### Task 8: Logger

**Files:**
- Create: `src/logger.js`
- Test: `test/logger.test.js`

**Interfaces:**
- Produces: `createLogger(filePath:string, opts?:{maxBytes?:number}): {info(msg:string):void, warn(msg:string):void, error(msg:string):void, tail(n:number):string[]}` (baris berawalan stempel waktu ISO dan level; bila berkas melewati `maxBytes`, default 1_000_000, diputar menjadi `<file>.1`)

- [ ] **Step 1: Tulis test**: tiga pesan → `tail(2)` mengembalikan dua terakhir berurutan; baris memuat level; melewati `maxBytes` → `<file>.1` ada dan berkas utama tidak lebih besar dari batas; folder induk belum ada → dibuat; kegagalan menulis (path tak valid) tidak melempar.
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `src/logger.js`.**
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: file logger`

### Task 9: Tombol perawatan

**Files:**
- Create: `src/hotkeys.js`
- Test: `test/hotkeys.test.js`

**Interfaces:**
- Produces:
  - `actionForKey(e:{key:string, ctrlKey:boolean}): 'status'|'address'|'camera-settings'|'fullscreen'|'quit-hold'|null` (F1, F2, F3, F11; Ctrl+Q → `quit-hold`; selain itu `null`, termasuk Ctrl dengan tombol lain)
  - `createHoldDetector(onFire:()=>void, ms?:number): {down():void, up():void}` (default 2000; `down` berulang karena auto-repeat tidak mengatur ulang pewaktu; `up` sebelum `ms` membatalkan)

- [ ] **Step 1: Tulis test**: pemetaan semua tombol dan `null` untuk `a`, `Ctrl+W`, `Q` tanpa Ctrl; detector memanggil `onFire` tepat sekali setelah 2000 ms ditahan (`mock.timers`), tidak memanggil bila dilepas pada 1999 ms, dan `down` berulang tidak menggandakan panggilan.
- [ ] **Step 2: Jalankan test**. Expected: FAIL.
- [ ] **Step 3: Implementasikan `src/hotkeys.js`.**
- [ ] **Step 4: Jalankan test**. Expected: PASS.
- [ ] **Step 5: Commit** `feat: maintenance hotkeys`

### Task 10: Cangkang Electron

**Files:**
- Create: `src/main.js`, `src/preload.js`, `src/renderer/index.html`, `src/renderer/app.mjs`, `src/renderer/style.css`
- Modify: `package.json` (devDependency `electron`, dipin persis)

**Interfaces:**
- Consumes: `loadConfig`/`updateConfig` (Task 1), `ensureOutputs` (2), `candidateAddresses` (3), `createSupervisor` (4), `createLogger` (8), `actionForKey`/`createHoldDetector` (9), `createCameraController` (6), `screenFor` (7).
- Produces (IPC lewat `contextBridge` sebagai `window.mv`): `onAtemState(cb:(s:{state,address?,outputWarning})=>void)`, `getConfig():Promise<Config>`, `saveCameraMode(m:Mode):void`, `logCamera(status:string):void`, `onMenu(cb:(action:'status'|'address')=>void)`, `submitAddress(address:string):Promise<boolean>`, `getStatusInfo():Promise<{address?:string, logTail:string[]}>`.

- [ ] **Step 1: Pasang Electron**: `npm install --save-dev --save-exact electron` lalu catat versinya di `package.json`.
- [ ] **Step 2: Implementasikan `src/main.js`**: kunci instance tunggal; jendela `fullscreen:true`, `autoHideMenuBar:true`, `contextIsolation:true`, `nodeIntegration:false`, preload; `setPermissionRequestHandler` dan `setPermissionCheckHandler` mengizinkan `media`; config dan log di `app.getPath('userData')`; buat supervisor dengan `createAtem` memakai `new Atem()` dari `atem-connection`, `getCandidates` dari `candidateAddresses` dengan `os.networkInterfaces()`; teruskan event `state` ke renderer; `before-input-event` memetakan tombol lewat `actionForKey` (F1/F2 → kirim `menu`, F3 → `shell.openExternal('ms-settings:privacy-webcam')`, F11 → toggle layar penuh, Ctrl+Q lewat `createHoldDetector` → `app.quit()`); `submit-address` memanggil `supervisor.tryAddress`.
- [ ] **Step 3: Implementasikan renderer**: `app.mjs` memegang `camera`, `atem`, `outputWarning`, `hadVideo`; merender hasil `screenFor` (layar status berupa teks besar kontras tinggi; layar video berupa `<video autoplay muted>` + veil/banner); meneruskan `reportFrame` dari `requestVideoFrameCallback`; panel F1 (keadaan, alamat, mode kamera, `logTail`) menutup sendiri 15 dtk; panel F2 berupa input teks, Enter mengirim `submitAddress`, Esc membatalkan; `cursor:none` global; chip status kecil memudar setelah beberapa detik, banner kuning menetap. `measureFps` menghitung frame `requestVideoFrameCallback` selama 3000 ms pada stream yang sedang dibuka.
- [ ] **Step 4: Verifikasi di Windows** dengan ATEM tercolok: `npm install` lalu `npm start` di `C:\atem-mvlauncher`. Expected: layar penuh "Menunggu ATEM…" → tersambung → output diatur → multiview tayang; F1 menampilkan panel; Ctrl+Q ditahan 2 dtk menutup aplikasi.
- [ ] **Step 5: Commit** `feat: electron kiosk shell`

### Task 11: Kios, auto-start, paket, dokumentasi perawatan

**Files:**
- Modify: `src/main.js`, `package.json` (konfigurasi `electron-builder`, skrip `dist`)
- Create: `docs/maintenance.md`

**Interfaces:**
- Consumes: cangkang dari Task 10.

- [ ] **Step 1: Tambah ke `src/main.js`**: `powerSaveBlocker.start('prevent-display-sleep')`; `app.setLoginItemSettings({openAtLogin:true})` hanya saat `app.isPackaged`; `app.relaunch()` + `app.exit(0)` pada `render-process-gone`, `child-process-gone`, dan `uncaughtException`, dibatasi maksimal 5 relaunch per menit agar tidak mengulang tanpa henti; semua kejadian ini ditulis ke log.
- [ ] **Step 2: Konfigurasi `electron-builder`**: target `nsis` (Windows x64) dengan `oneClick: true` dan `perMachine: false`, nama berkas `ATEM-MV-Launcher-Setup-<versi>.exe`, lalu jalankan `npm run dist` di PC Windows pembangun. Expected: satu installer `.exe` muncul di `dist/`, bisa dipasang di PC bersih tanpa Node, dan mendukung pemasangan senyap (`Setup.exe /S`).
- [ ] **Step 3: Tulis `docs/maintenance.md`**: empat langkah persiapan sekali jalan dari spec §5.5, lokasi file config dan log, tabel tombol perawatan, cara mengganti alamat ATEM.
- [ ] **Step 4: Verifikasi di mini PC bersih (tanpa Node)**: jalankan installer, restart Windows. Expected: login otomatis, aplikasi jalan sendiri, multiview tayang tanpa menyentuh apa pun. Matikan paksa proses aplikasi lewat Task Manager. Expected: aplikasi hidup lagi.
- [ ] **Step 5: Commit** `feat: kiosk hardening, packaging and maintenance docs`

### Task 12: Bonjour (DIBUANG 2026-11-05, tidak dikerjakan)

**Files:**
- Create: `scripts/browse-bonjour.js` (spike)
- Modify bila lolos: `src/discovery.js`, `src/main.js`; bila gagal: `docs/superpowers/specs/2026-11-05-atem-mv-launcher-design.md` §5.2

**Interfaces:**
- Produces bila lolos: `findViaBonjour(timeoutMs:number): Promise<string[]>` di `src/discovery.js`, dipakai `getCandidates` setelah `usb` dan sebelum menyerah.

- [ ] **Step 1: Spike di Windows**: pasang `bonjour-service` sebagai devDependency, tulis `scripts/browse-bonjour.js` yang mencari layanan `_blackmagic._tcp` selama 10 dtk dan mencetak nama dan alamat. Jalankan dengan ATEM tersambung lewat Ethernet dan lewat USB. Expected: dicatat apakah ATEM muncul.
- [ ] **Step 2 (jika muncul): implementasikan `findViaBonjour`**, dengan test untuk bagian murni (pemetaan hasil layanan → daftar alamat IPv4 unik) di `test/discovery.test.js`, dan sambungkan ke `getCandidates` di Task 10.
- [ ] **Step 3 (jika tidak muncul): hapus langkah Bonjour** dari spec §5.2 dan dari storyboard, hapus devDependency, hapus skrip spike.
- [ ] **Step 4: Commit** `feat: bonjour discovery` atau `docs: drop bonjour discovery`

### Task 13: Verifikasi lapangan dengan ATEM asli

**Files:**
- Modify: `src/config.js` (`DEFAULT_CONFIG.cameraName` bila nama asli berbeda), `docs/superpowers/specs/2026-11-05-atem-mv-launcher-design.md` §9

- [ ] **Step 1: Catat nama perangkat UVC** dari panel F1 atau `enumerateDevices()` di Windows. Expected: dicatat. Bila tidak mengandung "ATEM Mini Pro", ubah `DEFAULT_CONFIG.cameraName` dan test Task 1/6 yang bergantung padanya.
- [ ] **Step 2: Catat mode UVC terpilih** (resolusi, frame rate terukur) dari panel F1. Expected: kemungkinan 1920×1080 dengan fps mengikuti ATEM (1080p50). Catat hasilnya di spec §9.
- [ ] **Step 3: Uji skenario**: (a) restart ATEM (cabut daya) → Aux kembali ke bawaan, aplikasi menemukan ATEM, mengatur ulang Aux, dan multiview tayang kembali; (b) cabut lalu colok USB-C → layar "ATEM terputus", pulih sendiri; (c) buka OBS atau Zoom yang memegang kamera sebelum aplikasi → layar "kamera dipakai aplikasi lain", pulih setelah aplikasi lain ditutup; (d) kontrol lewat Ethernet dengan USB-C dicabut → layar "kamera tidak ditemukan"; (e) PC tanpa keyboard dan mouse selama 24 jam → tetap tayang.
- [ ] **Step 4: Commit** `docs: record field verification results`
