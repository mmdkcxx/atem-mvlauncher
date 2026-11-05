# ATEM MV Launcher: perawatan

Aplikasi ini dibuat untuk mini PC yang dibiarkan tanpa keyboard dan mouse. Dokumen ini untuk saat kamu perlu memasang di PC baru atau memeriksa masalah.

## Persiapan sekali jalan (PC baru, dengan keyboard dan mouse)

1. Jalankan `ATEM-MV-Launcher-Setup-<versi>.exe`. Windows SmartScreen bisa menampilkan "Windows protected your PC" karena installer belum ditandatangani. Pilih **More info**, lalu **Run anyway**. Pemasangan senyap: `ATEM-MV-Launcher-Setup-<versi>.exe /S`. Setelah terpasang, aplikasi mendaftarkan dirinya agar jalan saat login.
2. Aktifkan login otomatis Windows supaya PC langsung masuk ke desktop setelah mati listrik (misalnya lewat `netplwiz`).
3. Buka **Pengaturan Windows → Privasi & keamanan → Kamera**, lalu aktifkan **Biarkan aplikasi desktop mengakses kamera**.
4. Colok kabel USB-C dari ATEM ke PC ini. Jalankan aplikasi dan pastikan multiview tayang. Cabut keyboard dan mouse, restart PC, lalu pastikan semuanya jalan sendiri.

Aplikasi tidak membutuhkan Node.js atau program lain di PC tujuan.

## Yang dilakukan aplikasi sendiri

- Mencari ATEM dengan urutan: alamat terakhir yang berhasil, lalu pasangan alamat adapter USB (`/30`).
- Setiap koneksi baru ke ATEM, Aux 0 (HDMI Out) diatur ke Program dan Aux 1 (Webcam Out) diatur ke Multi View. Hanya Aux yang salah yang diubah.
- Membuka kamera UVC bernama "ATEM Mini Pro" dengan resolusi tertinggi, lalu frame rate tertinggi di resolusi itu.
- Pulih sendiri saat ATEM terputus, ATEM restart, atau kamera hilang.
- Layar tidak boleh tidur. Kalau aplikasi mati karena error, ia dijalankan lagi (maksimal 5 kali per menit).

## Tombol perawatan (hanya kalau keyboard dicolok)

| Tombol | Fungsi |
|---|---|
| `F1` | Panel status: keadaan, alamat ATEM, mode kamera, lokasi folder data, dan log terakhir. Menutup sendiri setelah 15 detik atau ditekan lagi |
| `F2` | Isi alamat ATEM manual. Enter untuk mencoba, Esc untuk batal. Alamat yang berhasil disimpan sebagai alamat terakhir |
| `F3` | Buka pengaturan kamera Windows |
| `F11` | Keluar atau masuk layar penuh (untuk mengakses desktop) |
| `Ctrl` + `Q` | Tahan 2 detik untuk menutup aplikasi |

## Lokasi file

Folder data aplikasi ditampilkan di panel `F1` (baris **Data**). Biasanya `%APPDATA%\<nama aplikasi>\`. Isinya:

- `config.json`: `lastAddress` (alamat ATEM terakhir), `cameraName` (nama kamera yang dicari), `cameraMode` (mode kamera yang terakhir dipakai).
- `app.log` (dan `app.log.1`): log. Setiap baris berawalan waktu dan level.
- `relaunch.json`: catatan relaunch otomatis.

## Mengganti alamat ATEM

- Dengan keyboard: tekan `F2` dan ketik alamatnya.
- Tanpa keyboard: tutup aplikasi, ubah `lastAddress` di `config.json`, lalu jalankan lagi. Kalau file rusak, aplikasi memakai nilai bawaan dan menyimpan file lama sebagai `config.json.corrupt-<waktu>`.

## Masalah umum

| Yang tampil di layar | Penyebab dan yang dicek |
|---|---|
| ATEM tidak ditemukan | Kabel USB-C, ATEM menyala, atau alamat berbeda (tekan `F2`) |
| Kamera ATEM tidak terlihat | Kabel USB-C harus tercolok ke PC ini, walau kontrol lewat Ethernet |
| Kamera dipakai aplikasi lain | Tutup OBS, Zoom, Teams, atau aplikasi lain yang memakai kamera |
| Windows memblokir kamera | Aktifkan akses kamera untuk aplikasi desktop (langkah 3 di atas, atau tekan `F3`) |
| Spanduk kuning "Output ATEM belum sesuai" | Aplikasi tidak berhasil mengubah Aux. Cek koneksi; aplikasi mengulang tiap 30 detik |
