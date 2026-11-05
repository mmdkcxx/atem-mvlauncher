# Verifikasi lapangan (di Windows, dengan ATEM asli)

Bagian ini belum bisa dikerjakan dari WSL. Jalankan di PC Windows dengan ATEM Mini Pro tercolok lewat USB-C, lalu catat hasilnya di tabel akhir dokumen.

## Cara menjalankan

Cara tercepat tanpa installer: salin folder `dist/win-unpacked/` (hasil `npm run dist`, atau minta dibuatkan) ke Windows dan jalankan `ATEM MV Launcher.exe`. Atau dari sumber: `git clone \\wsl$\<distro>\home\doh_rog\atem-mvlauncher C:\atem-mvlauncher`, lalu `npm install` dan `npm start` (butuh Node 22 di Windows).

## Uji dasar (Tugas 10)

- [ ] Layar penuh "Menunggu ATEM…" muncul, lalu tersambung, output diatur, dan multiview tayang.
- [ ] `F1` menampilkan panel status (keadaan, alamat, mode kamera, folder data, log). Menutup sendiri setelah 15 detik.
- [ ] `Ctrl`+`Q` ditahan 2 detik menutup aplikasi. Dilepas sebelum 2 detik tidak menutup.
- [ ] Renderer tidak kosong (jaga-jaga: modul ES dari `file://` harus termuat; kalau layar kosong, catat dan kabari).

## Uji pemasangan (Tugas 11)

- [ ] `npm run dist` di Windows menghasilkan satu installer `.exe` di `dist/`.
- [ ] Installer dijalankan di PC bersih (tanpa Node): aplikasi terpasang dan jalan.
- [ ] Restart Windows: login otomatis, aplikasi jalan sendiri, multiview tayang tanpa menyentuh apa pun.
- [ ] Matikan paksa proses aplikasi lewat Task Manager: aplikasi hidup lagi.

## Skenario (Tugas 13)

- [ ] (a) Restart ATEM (cabut daya): Aux kembali ke bawaan, aplikasi menemukan ATEM, mengatur ulang Aux, dan multiview tayang kembali.
- [ ] (b) Cabut lalu colok USB-C: layar "ATEM terputus", lalu pulih sendiri.
- [ ] (c) Buka OBS atau Zoom yang memegang kamera sebelum aplikasi dijalankan: layar "Kamera dipakai aplikasi lain", dan pulih setelah aplikasi lain ditutup.
- [ ] (d) Kontrol lewat Ethernet dengan USB-C dicabut: layar "Kamera ATEM tidak terlihat".
- [ ] (e) PC tanpa keyboard dan mouse selama 24 jam: tetap tayang.

## Uji Bonjour (Tugas 12)

- [ ] `node scripts/browse-bonjour.js 10` dengan ATEM lewat USB: ATEM muncul? ya / tidak
- [ ] `node scripts/browse-bonjour.js 10` dengan ATEM lewat Ethernet: ATEM muncul? ya / tidak

Kalau tidak muncul di keduanya, langkah Bonjour dibuang dari spec §5.2 dan storyboard.

## Hasil yang perlu dicatat

| Hal | Hasil |
|---|---|
| Nama perangkat UVC sebenarnya (label di `enumerateDevices`) | `Blackmagic Design (1edb:be55)` (2026-11-05) |
| Mode UVC terpilih (resolusi dan fps terukur, dari panel `F1`) | 1920×1080 @ 50 fps, dipilih otomatis (2026-11-05) |
| Mode video ATEM saat uji | 1080p50 (diukur 2026-11-05) |
| Bonjour: USB | |
| Bonjour: Ethernet | |

Kalau nama perangkat tidak mengandung "ATEM" atau "Blackmagic" (F1 menampilkan nama kamera yang terlihat), ubah `DEFAULT_CONFIG.cameraName` di `src/config.js` dan sesuaikan test yang bergantung padanya.

## Hasil skenario (Windows, 2026-11-05)

| Skenario | Hasil |
|---|---|
| ATEM Software Control di-uninstall | Aman, aplikasi tetap jalan |
| USB dicabut lalu dipasang lagi | Berfungsi |
| Kamera dipakai aplikasi lain | Berfungsi |
| Kontrol lewat Ethernet saja | Belum diuji |
| Jalan 24 jam | Belum diuji |
