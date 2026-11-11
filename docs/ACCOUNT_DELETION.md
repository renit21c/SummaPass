# Hapus akun dan keluar

## Aktivasi

Jalankan `supabase/migrations/202611110023_account_deletion.sql` setelah migrasi 022. Tidak perlu environment variable baru; memakai koneksi Supabase dan service-role key yang sudah tersedia.

## Pengalaman pengguna

- Akun saya memiliki tombol **Keluar akun** berwarna merah dengan border dan bayangan mengikuti gaya SummaPass.
- Bagian **Hapus akun** menjelaskan bahwa akses akun hilang, sedangkan transaksi, peserta, dan audit acara tetap tersimpan.
- Akun Supabase memasukkan kata sandi saat ini. Akun demo menghapus sesi lokal saja.
- Setelah menekan Hapus akun, pengguna membaca konfirmasi dampak, lalu dialog kedua mengharuskan mengetik `HAPUS AKUN` secara persis.
- Sesudah berhasil, sesi dibersihkan dan pengguna diarahkan ke halaman masuk dengan pesan berhasil.
- Tiket yang sudah disimpan tetap dapat divalidasi petugas; menghapus akun tidak memproses refund. Akses tiket melalui akun tersebut hilang, sehingga dialog meminta pengguna menyimpan tiket terlebih dahulu.
- Organizer tunggal pada event yang belum selesai dan belum dibatalkan tidak dapat menghapus akun sampai ada organizer pengganti atau event dibatalkan.

## Data dan akses

- Identitas pengguna selalu diambil dari sesi server; endpoint menolak user ID tambahan, konfirmasi salah, password salah, permintaan lintas origin, dan permintaan berulang berlebihan.
- Kata sandi diverifikasi lewat client Supabase terpisah tanpa mengganti cookie sesi pengguna. Session verifikasi langsung dikeluarkan.
- RPC service-only mengunci baris event dan profil, membatalkan hold belum dibayar, melepas alokasi, mengganti nama profil menjadi `Akun dihapus`, menandai `deleted_at`, mencabut assignment, dan menghapus notifikasi/preferensi milik akun.
- Data peserta, booking, pembayaran lunas, check-in, serta audit tidak dihapus atau di-refund otomatis.
- `active_account_uid()` digunakan oleh RPC yang sebelumnya memakai `auth.uid()`. Kebijakan RLS restriktif memblokir akses tabel langsung dari akun yang telah ditutup. JWT lama tidak mendapat akses hanya karena belum kedaluwarsa.
- Supabase Auth dipanggil dengan soft deletion agar referensi UUID transaksi tetap valid. Penghapusan ini tidak menyediakan tombol pemulihan akun. Akun tidak bisa masuk lagi dengan kredensial lama.
- Antrean `account_deletions` menyimpan cleanup Auth yang belum selesai. Worker notifikasi mencoba kembali sebelum menjalankan pekerjaannya, termasuk saat pengiriman email dinonaktifkan. Baris profil sudah memblokir akses saat layanan Auth sedang gagal.
- Favorit di browser dibersihkan setelah penghapusan berhasil. Metadata peserta dan audit historis tetap menjadi data operasional, bukan bukti penghapusan seluruh data pribadi.

## Pemeliharaan

Migrasi berikutnya yang menambahkan RPC identitas atau tabel RLS baru harus memakai `active_account_uid()` atau pemeriksaan akun aktif yang setara. Jangan mengembalikan pemeriksaan `auth.uid()` saja pada operasi pengguna.

Tes: `npx tsx --test tests/account-deletion.test.ts`.

Pengujian memakai database lokal dan identitas fiktif. Tidak ada akun Supabase asli yang dihapus saat pengembangan.
