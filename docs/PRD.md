# SummaPass — Product Requirements Document

Status: usulan v0.1 untuk persetujuan.

## Tujuan
Memudahkan pengunjung menemukan event, memilih kursi, membayar melalui simulasi, menerima e-ticket, dan masuk melalui QR. Organizer mengelola event dan memantau transaksi; staff memvalidasi tiket sesuai penugasan event.

## Lingkup wajib
| Area | Kebutuhan dan hasil yang diterima |
|---|---|
| Discovery | Homepage editorial, pencarian, filter kategori/tanggal/harga, sorting, detail jadwal/lokasi/aturan/periode penjualan |
| Akun | Supavvbase Auth, profil attendee, akses organizer/staff berdasarkan penugasan event |
| Kursi | SVG panggung/section/baris/nomor, kategori eligible, legenda, alternatif daftar, ringkasan harga dan konflik availability |
| Booking | Reservasi multi-kursi atomik, countdown dari waktu server, expiry tanpa bergantung cleanup |
| Checkout | Nama attendee per kursi, kontak pemesan, persetujuan syarat, rincian harga server, simulasi pembayaran berlabel jelas |
| Tiket | Satu tiket per kursi setelah paid, QR opaque unik, My Tickets, detail, cetak/simpan PDF melalui browser |
| Organizer | CRUD/publish/unpublish/archive event; kategori, kuota, periode jual, section; tabel booking/attendee/payment; CSV; analytics |
| Check-in | Kamera dan manual reference, validasi server, konfirmasi masuk atomik, identitas staff dan waktu tersimpan |
| Kualitas | Mobile-first, keyboard, focus, kontras, loading/empty/error/success, pengujian concurrency dan akses |

## Peran dan akses
Visitor hanya membaca event published. Attendee membaca booking/tiket miliknya. Organizer mengelola event yang ditugaskan. Staff hanya lookup dan check-in event yang ditugaskan, tanpa akses daftar kontak lengkap. Tidak ada peningkatan role mandiri; kontrol server dan RLS wajib.

## Usulan aturan bisnis
- UI Bahasa Indonesia, mata uang IDR integer, jadwal event Asia/Jakarta; penyimpanan UTC.
- Login sebelum reservasi; browsing dan pemilihan lokal kursi boleh tanpa login.
- Hold 10 menit, maksimal 6 kursi per booking, satu kategori per booking. Pemilihan lokal belum menahan kursi.
- Nama per kursi wajib; email kontak cukup pada pemesan. Form selesai sebelum hold dibuat agar countdown hanya untuk pembayaran.
- Biaya layanan demo Rp0, tanpa pajak/discount tambahan; snapshot harga tetap disimpan. Perubahan biaya nanti memerlukan keputusan produk.
- Pembayaran gagal langsung melepas seluruh kursi; retry membuat booking baru. Payment pending tidak memperpanjang hold.
- Tidak ada pembayaran terlambat; saat batas expiry tepat tercapai reservasi tidak eligible lagi.
- Unpublish menghentikan booking baru; hold yang sudah sah boleh dibayar sampai expiry. Archive hanya setelah tidak ada hold aktif dan event selesai; tiket historis tetap tersedia.
- Jadwal/venue/kursi terjual tidak dapat diubah melalui editor biasa. Kuota tidak boleh di bawah jumlah sold + hold aktif.
- Refund/cancellation setelah paid, transfer tiket, recurring event, general admission, payment gateway, email otomatis, dan seat editor drag-and-drop di luar MVP. Sistem tetap mengenali tiket revoked/cancelled untuk validasi.

## Ukuran keberhasilan dan acceptance
Demo end-to-end discovery → reserve → paid → QR → check-in dapat diselesaikan. Dua permintaan kursi sama menghasilkan tepat satu pemenang; konflik multi-kursi rollback seluruhnya. Reservasi expired bisa dibeli ulang. Retry payment tidak menggandakan tiket atau revenue. Dua check-in bersamaan menghasilkan satu catatan. Akses lintas pemilik/event ditolak server/database. Tidak ada data pribadi di QR.

Dashboard: revenue confirmed = jumlah subtotal tiket booking confirmed dengan payment paid (biaya terpisah); sold = allocation SOLD; remaining = inventory eligible dikurangi sold dan hold aktif, dibatasi sisa kuota kategori; pending = payment pending dengan hold aktif; attendance rate = check-in unik / tiket aktif yang issued, 0% bila denominator nol. Total booking mencakup semua status dan ditampilkan menurut filter tanggal/event.

## Asumsi dan ketergantungan
Event/venue/data attendee seluruhnya fiktif. Technical Brief asli, aset resmi, kredensial Supabase, hosting dan kebijakan legal belum disediakan. Palette hanya inspirasi, bukan klaim brand resmi. Jika kredensial belum ada, adapter demo dipisah dan diberi label; bukti concurrency produksi tetap memerlukan PostgreSQL. Seluruh aturan usulan di atas dapat direvisi saat review.
