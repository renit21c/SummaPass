# Kategori dan paket tiket

## Mengaktifkan

Jalankan `supabase/migrations/202611110022_ticket_categories_packages.sql` setelah migrasi 021, lalu jalankan/deploy kode terbaru. Tidak ada environment variable baru.

## Organizer

1. Simpan event terlebih dahulu.
2. Di Edit event, buka **Kategori dan paket tiket**. Menu yang sama tersedia di Kelola event.
3. Tambah kategori dengan nama bebas, misalnya VIP A, VIP B, Festival, atau Early Bird. Isi deskripsi, harga Single, kuota peserta, periode penjualan WIB, dan status aktif.
4. Event berkursi: pilih section yang boleh digunakan. Kuota tidak boleh melebihi kapasitas section.
5. Event tanpa kursi: setiap kategori memiliki persediaan sendiri. Total kuota kategori maksimal 2.000 peserta.
6. Pilih kategori tersimpan, lalu tambah/edit paket Single, Couple, Group, atau Custom. Nama bebas, 1 sampai 10 peserta per paket. Isi **harga total per paket** dan kuota paket opsional.

Single dibuat otomatis untuk kategori baru maupun kategori lama. Harga Single bawaan mengikuti harga kategori. Paket dapat dinonaktifkan tanpa menghapus riwayat. Maksimal 30 kategori dan 20 paket per kategori.

Form detail event tidak menimpa harga/kuota kategori yang sudah diatur melalui pengelola tiket. Penggantian denah pada draf tanpa booking tetap mengganti konfigurasi kategori dan paket, dengan konfirmasi.

## Buyer

Pilih kategori, paket, dan jumlah paket. Sistem menampilkan jumlah peserta dan harga total, maksimal 6 paket dan 30 peserta per pesanan. Contoh: 2 paket Group, masing-masing 4 orang, menghasilkan 8 tiket.

Event berkursi membutuhkan tepat satu kursi per peserta. Tombol **Cari kursi berdekatan** mencari nomor kursi berurutan pada section dan baris yang sama. Jika tidak tersedia, buyer mendapat pesan dan dapat memilih kursi secara manual. Kursi tidak ditahan sampai reservasi berhasil.

Event tanpa kursi langsung menampilkan isian nama seluruh peserta. Setiap peserta memperoleh QR tersendiri. Nama kategori/paket tersimpan pada pesanan dan tiket; email PDF mendukung sampai 30 tiket dalam satu lampiran, dengan batas ukuran 1 MB.

Harga mulai dari pada katalog dan pilihan kategori mengikuti harga paket aktif termurah. Harga ditulis per paket beserta jumlah pesertanya.

## Aturan transaksi

- Server memeriksa kategori, paket, periode jual, status event, jumlah peserta, kuota kategori, dan kuota paket.
- Semua reservasi paket mengunci baris event yang sama dengan pembayaran dan pembatalan. Pemilihan unit persediaan, alokasi kursi, pengecekan kuota, dan snapshot harga dilakukan dalam satu transaksi.
- Harga browser tidak dipercaya. Harga total dihitung dari harga paket di database.
- Harga paket dibagi ke setiap peserta dalam rupiah bulat. Sisa pembagian dibagikan per rupiah, sehingga jumlah seluruh tiket tepat sama dengan harga paket dikali jumlah paket. Pembayaran, refund, PDF, dan laporan memakai snapshot tersebut.
- Snapshot nama, ukuran, jumlah, dan harga paket tidak berubah ketika organizer mengedit harga berikutnya.
- Ukuran paket yang pernah memiliki booking tidak dapat diubah. Single bawaan tetap satu peserta; buat paket baru untuk ukuran berbeda.
- Kuota tidak boleh turun di bawah tiket/paket terjual dan reservasi aktif.
- Reservasi kedaluwarsa, pembatalan, dan pembayaran gagal melepas kuota. Pada refund sebagian, kuota peserta kembali; kuota paket suatu pesanan tetap terpakai selama masih ada tiket aktif dari pesanan itu.
- Idempotency key yang sama mengembalikan pesanan sama. Mengubah paket, jumlah, atau peserta dengan key lama ditolak.
- Setelah konfigurasi tiket dikelola secara terpisah, endpoint lama tanpa pilihan paket ditolak untuk mencegah bypass harga/kuota.
- Tabel paket menggunakan RLS; mutasi hanya melalui RPC yang memeriksa penugasan organizer dan versi konfigurasi. Perubahan dicatat pada audit log.

## Pengujian

`npx tsx --test tests/ticket-options.test.ts tests/general-admission.test.ts tests/flexible-seating.test.ts tests/ticket-pdf.test.ts`

Tes PostgreSQL lokal mencakup kedua mode event, akses per peran, harga bulat, delapan peserta, idempotensi, pembatasan kuota, snapshot pesanan, penerbitan QR, dan PDF sampai 30 peserta. Database Supabase produksi tidak dimodifikasi oleh tes ini.
