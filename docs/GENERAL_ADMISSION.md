# Event tanpa kursi

## Mengaktifkan

1. Jalankan `supabase/migrations/202611100020_general_admission.sql` di Supabase SQL Editor setelah migrasi 019. Migrasi lama tidak perlu dijalankan ulang.
2. Jalankan aplikasi atau deploy versi kode ini.
3. Organizer membuka Tambah event, memilih **Tanpa kursi** pada Jenis tiket, lalu mengisi harga dan jumlah tiket (1 sampai 2.000).
4. Simpan dan publikasikan event. Buyer membuka **Pesan tiket**, memilih jumlah (maksimal 6 per pesanan), mengisi nama peserta, lalu membayar.

Event lama tetap menggunakan kursi. Jenis tiket dipilih ketika membuat event dan terkunci setelah disimpan. Kuota dan harga masih dapat diperbarui; kuota tidak boleh di bawah tiket terjual ditambah reservasi aktif. Untuk mode tanpa kursi tersedia satu kategori Regular.

## Penyimpanan dan transaksi

- `events.seating_mode`: `SEATED` atau `GENERAL_ADMISSION`, default `SEATED`.
- Event tanpa kursi memakai unit persediaan internal di tabel alokasi yang sudah ada. Unit tersebut bukan kursi fisik, tidak ditampilkan atau dipilih buyer.
- Persediaan publik hanya berisi kuota dan sisa tiket; daftar kursi kosong.
- `reserve_general_admission` mengunci baris event sebelum memilih unit secara otomatis. Harga dihitung dari kategori di database. Fungsi reservasi kursi biasa menolak event tanpa kursi.
- Penghitungan kuota dan pemilihan unit berada dalam transaksi yang sama. Pesanan kedua tidak dapat mengambil unit aktif milik pesanan pertama.
- Reservasi kedaluwarsa tidak mengurangi ketersediaan walaupun worker belum berjalan. Pembatalan atau pembayaran gagal melepas persediaan melalui alur yang sudah ada.
- Idempotency key yang sama mengembalikan pesanan yang sama; perubahan peserta atau kategori dengan key lama ditolak.
- Unit historis dipertahankan ketika kuota turun untuk menjaga referensi booking dan audit. Kuota tetap menjadi batas penjualan.
- QR, pembayaran, email/PDF, dan check-in menggunakan alur yang sudah ada. Label tiket adalah **Tanpa nomor kursi**.
- Penggantian denah/kategori melalui RPC denah ditolak untuk event tanpa kursi. Harga dan kuota diatur melalui detail event.
- Helper database internal tidak dapat dipanggil oleh anon, authenticated, atau service_role. RPC publik tetap memeriksa identitas dan penugasan event.

## Verifikasi

`npx tsx --test tests/general-admission.test.ts tests/flexible-seating.test.ts`

Tes database memakai PostgreSQL lokal (PGlite), bukan database produksi. Mencakup akses per peran, kuota, retry, pembayaran berulang, check-in, serta regresi event berkursi. Tes demo juga mencakup pelepasan kuota setelah pembatalan/kedaluwarsa.
