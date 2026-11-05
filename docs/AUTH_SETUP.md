# Menjalankan autentikasi dan database

## Demo lokal
Tanpa .env.local, mode default adalah demo. Buka /login lalu pilih masuk sebagai pengunjung demo. Cookie sesi opaque bersifat HttpOnly, SameSite=Lax, berlaku 8 jam. Identitas disimpan di memori server dan hilang saat restart. Mode ini hanya untuk satu proses lokal, tidak untuk deployment multi-instance. Organizer demo dapat dipilih secara eksplisit; belum ada staff demo. Jangan memasukkan data pribadi pada mode demo.

Untuk HTTPS deployment set SUMMAPASS_COOKIE_SECURE=true. Local preview HTTP memakai false. Jangan deploy mode demo sebagai sistem produksi.

## Supabase
1. Siapkan proyek Supabase milik Anda. Tidak ada proyek remote yang dibuat atau diubah oleh tahap ini.
2. Terapkan supabase/migrations/202611030001_foundation.sql lalu supabase/seed.sql melalui SQL editor atau pipeline migrasi Supabase. Seed hanya berisi katalog fiktif.
3. Buat .env.local mengikuti .env.example, set SUMMAPASS_AUTH_MODE=supabase, URL proyek, publishable key, dan service-role key. Service-role key hanya digunakan server untuk memeriksa keberadaan akun sebelum mengirim tautan reset.
4. Pengguna dapat membuat akun melalui Supabase Auth. Konfirmasi email dikirim saat pendaftaran dan tautan reset dikirim dari halaman lupa kata sandi. Aktifkan Email Confirmation pada Supabase Auth serta pastikan URL redirect callback aplikasi diizinkan. Trigger membuat profiles secara otomatis.
5. Untuk organizer/staff, administrator menambahkan event_access dengan user_id, event_id dan role ORGANIZER atau STAFF. Jangan berikan akses tulis event_access kepada pengguna browser.
6. Build ulang dan restart aplikasi setelah mengubah environment. Login email/password diteruskan ke Supabase Auth; proxy menyegarkan cookie; server memakai getUser untuk validasi identitas.
7. Jalankan pengujian akun nyata untuk attendee, organizer dan staff sebelum penggunaan produksi. Katalog UI masih memakai adapter data fiktif lokal pada tahap ini; mengaktifkan auth Supabase tidak otomatis mengganti sumber katalog.

## Akses
/account memerlukan login. /organizer dan /staff memerlukan sesi serta penugasan yang cocok. Tanpa penugasan, halaman hanya menampilkan akses terbatas dan tidak memuat data event privat. Belum ada fitur pengelolaan/check-in pada halaman tersebut. Setiap endpoint operasional berikutnya wajib memeriksa event_id dan assignment lagi.

## Pengujian
npm test menguji redirect aman, konfigurasi Supabase yang fail-closed dan migrasi/RLS melalui PGlite (PostgreSQL WASM). auth.users dan auth.uid dibuat sebagai shim pengujian, bukan pengganti pengujian Supabase Auth nyata. Uji ini tidak mencakup jaringan, token refresh Supabase, Realtime, reservasi atau concurrency pembayaran.

npm run build memeriksa TypeScript dan build aplikasi. Tidak ada kredensial privileged yang ditanam dalam seed/source. Proses deployment belum dijalankan.


Tahap reservasi: setelah kedua migrasi diterapkan, jalankan seed.sql kembali untuk event_seats. Baca RESERVATIONS.md untuk RPC, kebijakan expiry dan batas mode demo. Proxy juga menyegarkan sesi pada route reservasi. Mode Supabase membutuhkan build ulang setelah env berubah.

Pembayaran dan e-ticket: terapkan migrasi003 dan tambahkan dua secret server sesuai PAYMENTS_TICKETS.md jika memakai Supabase. Tanpa secret, pembayaran fail-closed dengan pesan konfigurasi; login/reservasi biasa masih bisa dipakai. Mode demo tidak memerlukan secret eksternal. Tiket Saya tersedia di /my-tickets.

## Organizer demo dan laporan
Akses demo organizer kini dipilih secara eksplisit pada login/akun dan disimpan pada sesi server opaque, bukan role di cookie yang bisa dimodifikasi. Hanya tiga event fixture ditugaskan; staff tidak diberikan. Ini menggantikan batas lama bahwa semua sesi demo hanya attendee. Mode Supabase mengabaikan demoRole dan tetap memerlukan event_access yang dikelola administrator. Migrasi004 menambahkan organizer_snapshot yang selalu memfilter assignment dari auth.uid.
