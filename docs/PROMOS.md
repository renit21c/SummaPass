# Diskon otomatis dan voucher

## Aktivasi

1. Pastikan migrasi 001 sampai 023 sudah diterapkan.
2. Buka SQL Editor project Supabase SummaPass, salin seluruh isi `supabase/migrations/202611110024_event_promos.sql`, lalu Run sekali. Untuk project yang sudah terhubung CLI, bisa memakai `supabase db push`.
3. Jalankan `npm run supabase:check -- --promos` dari folder SummaPass. Pemeriksaan ini hanya membaca metadata dan menguji penolakan akses anonim.
4. Restart server lokal atau deploy kode terbaru setelah migrasi berhasil. Tidak ada environment variable baru.
5. Organizer membuka Kelola event > Diskon & Voucher untuk membuat promo. Promo dari `.data/promos.json` tidak otomatis dipindahkan ke Supabase.

## Aturan

- Diskon otomatis tidak memerlukan kode. Voucher dimasukkan pembeli.
- Potongan berupa persentase bulat 1 sampai 100 atau nominal Rupiah bulat. Total tidak pernah negatif.
- Berlaku untuk semua kategori atau satu kategori dalam event yang sama.
- Tanggal form menggunakan WIB, database menyimpan `timestamptz`. Waktu berakhir bersifat eksklusif.
- Minimal pembelian menghitung jumlah peserta, termasuk peserta dalam paket Couple/Group, maksimal 30 per pesanan.
- Potongan nominal berlaku sekali per pesanan. Promo tidak ditumpuk; potongan terbesar digunakan. Jika sama, diskon otomatis diprioritaskan.
- Kuota berlaku per pesanan yang memakai promo: reservasi aktif dan pesanan terkonfirmasi. Batal, gagal, atau kedaluwarsa mengembalikan kuota. Pesanan terkonfirmasi tetap memakai kuota, termasuk setelah refund.
- Voucher valid dengan potongan lebih kecil dapat dimasukkan; sistem memilih diskon otomatis dan kuota voucher tidak terpakai.
- Harga coret pada discovery dan pilihan paket merupakan penawaran untuk satu paket. Promo dengan minimum lebih besar muncul saat jumlah pesanan memenuhi syarat.
- Menghapus promo menonaktifkannya melalui `deleted_at`. Harga awal, potongan, nama promo, dan kode pesanan lama tetap tersimpan.

## Transaksi dan akses

RLS `event_promos` hanya mengizinkan organizer yang ditugaskan membaca daftar lengkap. Semua perubahan melalui RPC yang memeriksa akun aktif, peran, dan event. Peserta/petugas tidak memiliki write grant. Discovery publik hanya menampilkan diskon otomatis; quote voucher hanya mengembalikan kode yang dimasukkan secara tepat.

`reserve_with_promo` mengunci baris event seperti fungsi reservasi sebelumnya. Database membaca ulang harga, masa berlaku, kategori, jumlah peserta, dan sisa kuota. Pemesanan dan snapshot diskon dibuat dalam satu transaksi. Item tiket dibagi dalam Rupiah bulat agar jumlahnya sama dengan total bayar.

Idempotency key dan isi permintaan yang sama mengembalikan pesanan sebelumnya tanpa menambah penggunaan. Perubahan kode/paket/peserta pada key yang sama ditolak. Checkout lama tetap didukung; aplikasi terbaru menggunakan `reserve_with_promo` untuk semua pesanan.

## Pengujian

`npx tsx --test tests/promos.test.ts tests/promo-database.test.ts` menguji perhitungan dan PostgreSQL lokal melalui PGlite: RLS/peran/event, paket, kuota, retry, pembatalan/kedaluwarsa, diskon 100%, laporan, dan harga tiket setelah pembayaran.

Setelah migrasi remote, uji satu pembelian diskon otomatis dan satu voucher di lingkungan demo/staging. Cocokkan ringkasan, pembayaran, laporan, dan tiket. Tes lokal tidak membuktikan transaksi pada dua koneksi PostgreSQL produksi yang benar-benar bersamaan.
