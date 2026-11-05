# ATEM MV Launcher

Aplikasi kiosk Windows (Electron) untuk mini PC tanpa keyboard dan mouse. Ia menunggu ATEM Mini Pro tersambung, memastikan output ATEM sesuai, lalu menampilkan multiview dari Webcam Out (UVC) layar penuh.

## Fungsi

- **Output ATEM:** setiap koneksi baru, Aux 0 (HDMI Out) diatur ke **Program** dan Aux 1 (Webcam Out) ke **Multi View**. Hanya yang salah yang diubah. Berguna karena ATEM yang restart mengembalikan pengaturan ke bawaan.
- **Tampilan:** membuka kamera UVC ATEM layar penuh, memilih resolusi tertinggi dulu, lalu fps tertinggi di resolusi itu (contoh hasil: 1920×1080 @ 50 fps).
- **Pulih sendiri:** ATEM terputus atau restart, USB dicabut lalu dipasang lagi, kamera dipakai aplikasi lain. Aplikasi yang crash dijalankan lagi (maksimal 5 kali per menit), dan layar tidak tidur.
- **Mencari ATEM:** alamat terakhir yang berhasil, lalu pasangan alamat adapter USB-C (`/30`), lalu alamat manual lewat `F2`.

Semua teks di layar berbahasa Indonesia.

## Memasang

1. Unduh `ATEM-MV-Launcher-Setup-<versi>.exe` dari halaman [Releases](../../releases).
2. Jalankan. SmartScreen memperingatkan karena installer belum ditandatangani: pilih **More info**, lalu **Run anyway**. Pemasangan senyap: `/S`.
3. Colok USB-C dari ATEM ke PC. Aplikasi jalan sendiri saat login.

Tidak perlu Node.js di PC tujuan. Persiapan lengkap (login otomatis, izin kamera Windows) ada di [docs/maintenance.md](docs/maintenance.md).

## Tombol pemeliharaan (bila keyboard dicolok)

| Tombol | Fungsi |
|---|---|
| `F1` | Panel status: ATEM, kamera, mode, daftar kamera yang terlihat, log |
| `F2` | Isi alamat ATEM manual |
| `F3` | Pengaturan kamera Windows |
| `F11` | Keluar atau masuk layar penuh |
| `Ctrl` + `Q` | Tahan 2 detik untuk menutup aplikasi |

## Pengembangan

Butuh Node.js 20 atau lebih baru.

```
npm ci
npm test        # tes logika (node:test)
npm start       # jalankan aplikasi
npm run diagnose
npm run dist    # buat installer, harus di Windows
```

Struktur: `src/main.js` (proses utama), `src/supervisor.js` (koneksi dan pengaturan ATEM), `src/outputs.js`, `src/discovery.js`, `src/renderer/` (tampilan dan kamera UVC).

Dokumen lain: [perawatan dan build installer](docs/maintenance.md), [uji lapangan Windows](docs/field-verification.md), [desain](docs/superpowers/specs/2026-11-05-atem-mv-launcher-design.md).

## Catatan

- Di Windows kamera UVC ATEM bernama `Blackmagic Design`, bukan "ATEM Mini Pro". Nama yang dicari diatur di `DEFAULT_CONFIG.cameraName` (`src/config.js`, default `ATEM|Blackmagic`, dipisah `|`).
- Belum diuji: kontrol lewat Ethernet saja dan jalan 24 jam.
