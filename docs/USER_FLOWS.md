# User flows

## Attendee
```mermaid
flowchart TD
 A[Homepage / cari event] --> B[Detail event dan aturan]
 B --> C[Pilih kategori dan kursi]
 C --> D[Login jika diperlukan]
 D --> E[Detail attendee, ringkasan dan syarat]
 E --> F[Server reserve atomik]
 F -->|Konflik / sales closed| C
 F -->|Berhasil| G[Checkout countdown 10 menit]
 G --> H[Simulasi pembayaran]
 H -->|Paid eligible| I[Konfirmasi dan tiket diterbitkan sekali]
 H -->|Gagal / expired| J[Kursi dilepas, tawarkan booking baru]
 J --> C
 I --> K[My Tickets / detail QR / cetak]
```
Kembali dari login mempertahankan pilihan lokal, tetapi availability diperiksa ulang. Refresh checkout memuat booking dan expiry dari server. Putus jaringan saat payment: baca hasil transaksi sebelum retry. Konflik kursi menjelaskan kursi yang tidak tersedia dan memuat ulang peta. Countdown habis menonaktifkan pembayaran dan mengambil status server.

## Organizer
```mermaid
flowchart TD
 A[Login] --> B[Periksa role dan assignment]
 B -->|Ditolak| C[Halaman akses ditolak]
 B --> D[Dashboard event yang ditugaskan]
 D --> E[Draft event, venue, kategori dan kuota]
 E --> F[Validasi jadwal, inventory dan periode jual]
 F --> G[Publish]
 G --> H[Monitor booking, payment, attendee dan check-in]
 H --> I[Filter / detail / CSV terotorisasi]
 G --> J[Edit aman / unpublish / archive]
 J -->|Ada data sold yang terdampak| K[Tolak perubahan, jelaskan alasan]
```
Publish mensyaratkan venue, kategori eligible, harga dan jadwal valid. CSV mengikuti event/filter yang diizinkan, hanya kolom perlu, escape formula spreadsheet. Konfirmasi eksplisit untuk archive/unpublish.

## Staff
```mermaid
flowchart TD
 A[Login dan pilih assigned event] --> B[Kamera atau reference manual]
 B --> C[Validasi server tanpa check-in]
 C -->|VALID| D[Preview nama, kursi, konfirmasi masuk]
 D --> E[Validasi ulang dan insert atomik]
 E -->|Sukses| F[CHECKED_IN dengan timestamp]
 E -->|Didahului staff lain| G[ALREADY_USED]
 C --> H[INVALID / UNPAID / WRONG_EVENT / ALREADY_USED / CANCELLED_OR_REFUNDED]
 F --> B
 G --> B
 H --> B
```
Permission kamera ditolak/unsupported → input manual. Kamera berhenti saat navigasi/scan selesai. Offline tidak boleh menampilkan sukses; staff retry setelah jaringan pulih. INVALID tidak mengungkap data pemilik; WRONG_EVENT hanya tersedia kepada staff yang terautentikasi. Preview bukan jaminan masuk sampai konfirmasi atomik selesai.
