# Kategori dan Trending

- Ikon kategori memakai Lucide: Musik, Workshop, Keluarga, dan Semua. Label teks tetap tersedia.
- Ikon muncul di filter kategori, kartu event, dan detail event buyer.
- Trending ditentukan oleh jumlah tiket berstatus ACTIVE, alokasi SOLD, pesanan CONFIRMED, serta pembayaran PAID.
- Hanya event PUBLISHED yang belum selesai dan tidak dibatalkan yang ikut peringkat. Semua kategori dan kedua mode tiket dihitung bersama.
- Reservasi, transaksi gagal, dan tiket refund/dicabut tidak dihitung.
- Semua event dengan penjualan tertinggi yang sama mendapatkan badge. Jika belum ada penjualan, tidak ada badge.
- Filter pencarian, kategori, dan detail satu event tidak mengubah peringkat global.
- Buyer menerima boolean `isTrending` saja, tanpa angka penjualan atau data transaksi/peserta.
- Untuk Supabase, jalankan `202611100021_trending_events.sql` setelah migrasi 020. Sebelum migrasi ini, katalog tetap bisa dibuka, tetapi badge belum muncul.
- Mode demo menghitung berdasarkan tiket yang benar-benar diterbitkan dalam proses lokal, bukan kursi contoh yang ditandai terjual.

Tes: `npx tsx --test tests/trending-events.test.ts`.
