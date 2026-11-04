# Tahap peta kursi dan reservasi

## Cakupan
Peta SVG dengan panggung, section, baris dan nomor; keyboard Tab/Enter/Space; alternatif daftar dengan target minimal 44px; kategori Front dan Regular; nama per peserta; maksimal 6 kursi; server pricing IDR; hold 10 menit; daftar/detail reservasi; countdown dari waktu server; pembatalan dengan konfirmasi; pemilik saja yang membaca reservasi. Tombol detail event kini membuka pemilihan kursi.

Status AVAILABLE, SELECTED, RESERVED dan SOLD menggunakan warna sekaligus simbol/label. Nama peserta tidak dikirim melalui endpoint inventori atau Realtime. Pemilihan lokal tidak menahan kursi sampai server mengonfirmasi. Dua kursi Front A1/A2 ditandai terjual pada fixture demo lokal, bukan hasil penjualan nyata.

## Demo
Inventori dan booking disimpan pada global server Node tunggal, terpisah dari React. Critical section tidak mengandung await; mutasi pada satu proses diserialisasi. Tidak mendukung banyak proses atau persistence setelah restart. Cookie sesi juga bersifat ephemeral. Ini bukan bukti concurrency database produksi. Retry memakai idempotency key; kunci yang sama dengan payload berbeda ditolak.

## Supabase
Terapkan migrasi foundation lalu 202611030002_reservations.sql, kemudian seed.sql. Setelah migrasi diterapkan, adapter memakai RPC seat_inventory, reserve_booking, get_booking, my_bookings dan cancel_booking. Tidak ada fallback diam-diam ke demo saat RPC gagal.

Seluruh mutasi inventori memakai lock row event terlebih dahulu, lalu menjalankan validasi dan penulisan pada transaksi yang sama. Serialisasi per event dipilih untuk MVP yang kecil. Future payment/organizer RPC wajib mengikuti urutan lock yang sama. Unique partial index event_id/seat_id untuk RESERVED dan SOLD menjadi pertahanan tambahan. Record expired dilepas sebelum alokasi baru di bawah lock; query availability juga mengabaikan expiry sehingga tidak bergantung scheduler. Belum ada background expiry scheduler; cleanup dilakukan lazy di RPC, dan itu tidak menghalangi pembelian ulang.

RLS pada event_seats/bookings/booking_items/attendees. Tidak ada direct insert/update/delete grant kepada browser. Attendee hanya melihat data miliknya; organizer assigned boleh membaca booking event; staff tidak diberi akses directory peserta. Reserve RPC mengambil identitas dari auth.uid, bukan user ID browser.

## Sinkronisasi
Snapshot authoritative diperbarui tiap 5 detik, saat tab aktif kembali, jaringan pulih dan setelah konflik. Mode Supabase juga subscribe UPDATE pada event_seats secara event-scoped; RPC menaikkan revision sesudah perubahan. Tambahkan event_seats ke publication supabase_realtime jika publication belum tersedia saat migration. Reconnect memuat snapshot baru; Realtime tidak menjadi mekanisme locking. Jaringan gagal menampilkan error dan menonaktifkan reservasi sampai snapshot berikutnya berhasil.

## Pengujian
npm test mencakup foundation serta unit demo dan integration RPC menggunakan PGlite. Tests/reservations-http.mjs menjalankan dua pengguna dengan request bersamaan pada preview lokal port 3001. Pengujian multi-koneksi PostgreSQL/Supabase asli dan Realtime remote belum dijalankan karena koneksi belum tersedia. PostgreSQL WASM tidak memberi bukti locking antar-koneksi.

## Berikutnya
Pembayaran simulasi yang idempotent dan issuance QR e-ticket. Hold pada tahap ini belum menjadi tiket. Tidak mengumpulkan kartu, rekening, atau kredensial pembayaran nyata.
