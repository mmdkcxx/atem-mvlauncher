# ATEM MV Launcher: dokumen desain

Tanggal: 2026-11-05
Status: menunggu persetujuan
Storyboard (UI dan state): https://claude.ai/artifact/LZtvyC3XHwMTQJBCN9UhPn

## 1. Maksud dan alasan

Sebuah aplikasi Windows yang berjalan di mini PC tanpa keyboard dan mouse. Tugasnya:

1. Menunggu ATEM Mini Pro terkoneksi, lalu memastikan dua output ATEM sesuai target:
   - HDMI Out (aux 0) = Program
   - Webcam Out (aux 1) = Multi View
2. Menampilkan video Webcam Out (UVC dari ATEM, isinya multiview) layar penuh.
3. Pulih sendiri saat ATEM terputus atau restart.

**Mengapa:** setiap ATEM restart, pengaturan output kembali ke bawaan (aux 1 = Program, aux 0 = Multi View). Tanpa aplikasi ini, seseorang harus membuka ATEM Software Control dan mengubahnya manual. Mini PC ini akan dibiarkan terpasang, jadi tidak ada operator di tempat.

## 2. Tujuan, bukan tujuan, anti-tujuan

**Tujuan**
- Berjalan tanpa campur tangan sejak PC menyala sampai multiview tayang.
- Pulih dari ATEM restart, kabel dicabut, dan kamera hilang.
- Menemukan ATEM walau alamatnya berbeda di mini PC lain.
- Memakai mode UVC terbaik yang tersedia (lihat bagian 6).

**Bukan tujuan**
- Tidak mengendalikan ATEM selain mengatur dua Aux (tidak memindah input, tidak mengubah mode video ATEM).
- Tidak memaksa output kembali terus-menerus. Perubahan manual saat aplikasi berjalan dibiarkan.
- Tidak mendukung beberapa ATEM sekaligus.
- Tidak ada pengelolaan jarak jauh di dalam aplikasi.
- Tidak membuat layar pengaturan yang bisa diklik.

**Anti-tujuan (gagal walau secara teknis jalan)**
- Layar hitam atau beku tanpa penjelasan di layar.
- Aplikasi yang butuh mouse atau keyboard untuk bisa berfungsi normal.
- Gambar membeku yang tampak seperti tayangan langsung.

## 3. Batasan

- Platform: Windows (UVC dan layar penuh tidak mungkin dari WSL2).
- ATEM Mini Pro, api 131104. Dikontrol lewat `atem-connection` 3.10.3. Library ini hanya berbicara UDP ke satu alamat IP.
- Koneksi kontrol sudah terbukti jalan lewat USB-C: Windows membuat adapter jaringan virtual `/30`, PC `172.28.8.202`, ATEM `172.28.8.201`.
- Gambar UVC selalu datang lewat USB-C. Kontrol lewat Ethernet tidak menggantikan USB untuk gambar.
- Mode video ATEM saat diuji: 1080p50.
- Mini PC tidak punya keyboard atau mouse. Keyboard hanya dicolok sesekali untuk perawatan.

## 4. Pendekatan yang dipertimbangkan

| | Pendekatan | Ringkasan | Hasil |
|---|---|---|---|
| A | Aplikasi Electron tunggal | Proses utama Node menjalankan `atem-connection` dan pengawas koneksi. Jendela tampilan membuka kamera UVC lewat `getUserMedia` dan layar penuh. | **Dipilih** |
| B | Service Node + halaman web di browser kiosk | Dua program yang harus dijaga hidup bersamaan. Izin kamera dan layar penuh di browser lebih sering meminta konfirmasi. | Ditolak |
| C | Aplikasi native (C# atau Python) | Tidak ada library ATEM yang matang, protokol kontrol harus ditulis ulang. | Ditolak |

Alasan memilih A: `atem-connection` sudah terbukti jalan di repo ini dan satu program lebih tahan masalah di lapangan.

## 5. Keputusan yang sudah diambil bersama

### 5.1 Pengaturan output
- Setiap kali koneksi ke ATEM terbentuk (pertama kali atau setelah putus), aplikasi membaca `state.video.auxilliaries`.
- Kalau `auxilliaries[0] != 10010` (Program) atau `auxilliaries[1] != 9001` (Multi View), hanya yang salah diubah, dengan `atem.setAuxSource(source, auxIndex)`.
- Perubahan dianggap berhasil kalau ATEM mengirim `AuxSourceUpdateCommand` yang cocok. Tunggu 3 detik, ulangi sampai 3 kali.
- Kalau tetap gagal: lanjut buka kamera, tampilkan spanduk peringatan kuning, dan ulangi pengaturan tiap 30 detik.
- Tidak ada pemaksaan terus-menerus setelah berhasil.

### 5.2 Pencarian ATEM, berurutan
Berhenti di cara pertama yang berhasil:
1. Alamat terakhir yang berhasil (dari file konfigurasi).
2. Alamat pasangan adapter USB: untuk tiap adapter jaringan lokal dengan mask `/30`, coba alamat host lainnya di subnet itu.
3. Pencarian Bonjour (`_blackmagic._tcp`) di jaringan. Belum diverifikasi apakah ATEM Mini Pro benar mengumumkan layanan ini. Diuji saat implementasi. Kalau ternyata tidak ada, langkah ini dihapus.
4. Alamat manual yang diisi lewat keyboard (F2). Alamat diuji sebelum disimpan.

Pencarian berulang tiap beberapa detik tanpa batas. Satu percobaan menyambung dibatasi 5 detik.

### 5.3 Keadaan aplikasi
`Mencari → Menyambung → Cek output → (Atur output) → Buka kamera → Tayang`, ditambah `Tidak ditemukan` (setelah 20 detik tanpa hasil) dan `Masalah kamera`. Detail transisi ada di storyboard (diagram dan tabel keadaan). Poin penting:
- ATEM putus saat `Tayang` → kembali ke `Mencari`, lalu alur penuh diulang saat tersambung (cek output ikut diulang).
- Kamera hilang atau gambar macet 5 detik → kembali ke `Buka kamera`.
- Tidak ada keadaan buntu. Semua kegagalan berujung pada pencobaan ulang otomatis.

### 5.4 Layar masalah
Lima layar dengan pesan jelas dan tanpa tombol: ATEM tidak ditemukan, kamera tidak ditemukan (termasuk petunjuk bahwa USB-C harus tercolok walau kontrol lewat Ethernet), kamera dipakai aplikasi lain, izin kamera Windows diblokir, output gagal diatur (spanduk kuning, gambar tetap tayang).

### 5.5 Tanpa keyboard dan mouse
- Layar penuh sejak detik pertama, termasuk layar status dan error. Kursor disembunyikan.
- Aplikasi jalan otomatis saat PC menyala (login Windows otomatis) dan dijalankan lagi kalau berhenti karena error. Hanya satu salinan yang berjalan.
- PC dan layar tidak boleh masuk mode tidur.
- Pengaturan lewat satu file konfigurasi. Aplikasi menulis log.
- Tombol perawatan, aktif hanya kalau keyboard terpasang:

| Tombol | Fungsi |
|---|---|
| F1 | Panel status (keadaan, alamat ATEM, kamera, mode video, log terakhir). Menutup sendiri setelah 15 detik. |
| F2 | Isi alamat ATEM manual |
| F3 | Buka pengaturan kamera Windows |
| F11 | Keluar atau masuk layar penuh |
| Ctrl+Q ditahan 2 detik | Tutup aplikasi |

- Persiapan sekali jalan di mini PC baru (dengan keyboard): pasang aplikasi, aktifkan login otomatis, aktifkan izin kamera Windows untuk aplikasi desktop, cabut keyboard dan cek.

## 6. Pemilihan mode UVC

Aturan: **resolusi tertinggi dulu, lalu frame rate tertinggi di resolusi itu.** Kalau kamera hanya sanggup 1080p30 atau 720p60, yang dipakai 1080p30.

Chromium tidak menyediakan daftar mode kamera, jadi aplikasi mencari dengan mencoba:
1. Daftar kandidat diurutkan: resolusi (3840×2160, 1920×1080, 1280×720), lalu frame rate dalam tiap resolusi (60, 50, 30, 25).
2. Tiap kandidat dicoba dengan `exact`. Yang pertama diterima kamera dilanjutkan ke verifikasi.
3. Verifikasi: hitung frame yang benar-benar datang selama 3 detik (misalnya dengan `requestVideoFrameCallback`). Kalau jauh di bawah frame rate yang diminta (kurang dari ±90%), kandidat ditolak dan aplikasi turun ke berikutnya.
4. Mode yang lolos disimpan di konfigurasi dan dipakai langsung pada pembukaan berikutnya. Pencarian penuh diulang hanya kalau mode tersimpan gagal.
5. Mode yang terpakai tampil di panel F1.

Batas yang diketahui:
- Frame rate mengikuti mode video ATEM (1080p50 saat ini). Aplikasi tidak mengubah mode ATEM.
- Bandwidth USB (port, kabel, hub) bisa menurunkan mode. Verifikasi pengukuran menangkap ini.
- Kodek (MJPEG atau YUY2) dipilih otomatis oleh sistem, tidak bisa dipilih.
- Layar 60 Hz dengan sumber 50 fps bisa tampak sedikit tersendat. Tidak ditangani pada versi pertama.

## 7. Dipilih oleh pembuat (keputusan saya, bisa dibantah)

- Waktu: 20 detik sebelum panel "tidak ditemukan", 5 detik batas menyambung, 3 detik konfirmasi Aux, 5 detik batas gambar macet, 30 detik pengulangan pengaturan Aux yang gagal, 3 detik jeda pencobaan ulang kamera.
- Kamera dipilih berdasarkan nama perangkat ("ATEM Mini Pro"), bukan urutan.
- Format file konfigurasi: JSON di folder data aplikasi pengguna.
- Gambar membeku diberi lapisan gelap dan pesan "ATEM terputus".
- Penanda status kecil di pojok memudar setelah beberapa detik, kecuali spanduk peringatan kuning yang menetap.

## 8. Diserahkan ke pembuat

- Struktur kode, nama modul, dan cara menguji (pengawas koneksi perlu dipisah dari antarmuka supaya bisa diuji dengan ATEM tiruan).
- Cara mendaftarkan auto-start dan restart otomatis di Windows.
- Cara menyembunyikan kursor dan mencegah tidur di Electron dan Windows.
- Cara membuat paket `.exe`.
- Teks pesan final di tiap layar (isi di storyboard adalah patokan, bukan salinan akhir).
- Hasil uji Bonjour (bagian 5.2).

## 9. Risiko dan hal yang belum diuji

- Nama perangkat UVC yang sebenarnya di Windows belum diketahui ("ATEM Mini Pro" adalah dugaan). Perlu dicek di mini PC.
- Mode UVC yang sebenarnya didukung belum diukur. Hanya mode video ATEM (1080p50) yang diketahui.
- Perilaku Windows saat adapter USB muncul dan hilang (misalnya perubahan alamat setelah dicolok ulang) belum dipantau.
- Bonjour belum diverifikasi.
