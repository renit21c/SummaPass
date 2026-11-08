# Pembatasan request

## Cakupan

| API | Batas | Penghitung |
|---|---|---|
| POST `/api/auth/login` | 30 per 10 menit | IP tepercaya, atau satu bucket bersama jika IP tidak tersedia |
| Login Supabase dengan format kredensial valid | 10 per 10 menit | Email yang dinormalisasi, termasuk login berhasil dan gagal |
| POST `/api/bookings` | 12 per menit | Akun pemesan |
| POST `/api/bookings/:id/payment` | 20 per menit | Akun, mencakup seluruh booking |
| POST `/api/tickets/:id/resend` | 5 per 10 menit | Akun, mencakup seluruh tiket |
| POST `/api/staff/check-in` | 120 per menit | Akun petugas, validasi dan konfirmasi memakai anggaran yang sama |

Request yang mencapai guard dihitung termasuk payload invalid. Penolakan origin dan sesi dilakukan sebelumnya. Ini tidak mengganti pemeriksaan kepemilikan, role, assignment, transaksi atomik, idempotensi atau cooldown email yang sudah ada. Retry pembayaran tetap memakai booking yang sama setelah menunggu. Request yang ditolak tidak memanggil operasi bisnis berikutnya.

HTTP `429` memiliki `Retry-After` dalam detik, JSON `code: RATE_LIMIT`, `retryAfter`, dan pesan Indonesia. Login form browser menerima halaman HTML dengan status 429 dan tautan kembali. Tidak ada redirect otomatis atau retry otomatis. Jendela dimulai pada request pertama, tidak diperpanjang oleh request yang ditolak. Di batas pergantian jendela, dua burst berdekatan tetap dimungkinkan.

## Aktivasi Supabase

1. Jalankan **202611080016_request_limits.sql** sesudah migrasi 015, sekali saja di SQL Editor.
2. Restart aplikasi. Tidak perlu key baru. Hash identitas memakai HMAC dengan service-role key server yang sudah ada. Rotasi key akan mengganti identitas bucket.
3. Jalankan `node scripts/supabase-check.mjs --rate-limits` untuk pemeriksaan metadata dan penolakan anonim, tanpa menambah penghitung.

Penghitung Supabase memakai upsert atomik di database yang sama untuk seluruh instance/restart. Tabel hanya menyimpan hash, hitungan, dan waktu reset, tanpa IP/email mentah, password atau QR. Browser tidak mendapat izin tabel atau RPC. Expiry lebih dari satu jam dibersihkan bertahap, maksimal 100 baris setiap pemanggilan. Jika migrasi/config/database tidak tersedia, API yang dilindungi menolak dengan **503**, bukan melewati limit atau berpindah ke penghitung lokal. Terapkan migrasi sebelum menjalankan versi aplikasi ini dalam mode Supabase.

Demo memakai penghitung memori maksimal 10.000 bucket per proses, hilang saat restart. Ini hanya untuk lokal, bukan deployment multi-instance.

## Alamat jaringan

Lokal: biarkan `SUMMAPASS_TRUSTED_IP_HEADER` kosong. Semua login menggunakan satu bucket jaringan bersama. Limit operasi sesudah login tetap per akun.

Deployment: pilih `x-forwarded-for`, `x-real-ip`, atau `cf-connecting-ip` hanya jika reverse proxy tepercaya **menimpa** header dari klien dan akses langsung ke origin diblokir. Untuk `x-forwarded-for`, alamat pertama dipakai. Jangan aktifkan jika proxy hanya menambahkan alamat di belakang header kiriman klien. Header tidak valid memakai bucket bersama. Konfigurasi nama header tidak dikenal menolak request dengan 503. Tanpa konfigurasi ini, login seluruh pengguna tetap berbagi 30 percobaan per 10 menit.

## Batas perlindungan

Ini pembatasan lima API Next.js di atas, bukan proteksi DDoS dan bukan limiter seluruh endpoint. SDK Supabase Auth dan RPC booking/check-in yang dapat dipanggil langsung di Supabase tidak melewati guard Next.js; RLS dan validasi database tetap berlaku. Untuk produksi, aktifkan proteksi native Supabase Auth serta pembatasan gateway/WAF atau perluas pembatasan pada RPC. Endpoint daftar/reset password dan undangan menggunakan aturan/provider yang ada, belum memiliki guard baru ini.

## Pengujian

- `npx tsx --test tests/request-limits.test.ts`: batas/reset, isolasi, header palsu, kapasitas, format 429, persistensi PostgreSQL, izin dan pembersihan. PostgreSQL memakai PGlite, bukan bukti locking remote antarkoneksi.
- `node tests/request-limits-http.mjs`: gunakan **server demo lokal terisolasi yang baru dinyalakan**, port 3002 default, atau `SUMMAPASS_TEST_URL`. Menghabiskan anggaran limiter dan membuat sesi demo. Payload operasi sengaja tidak valid agar tidak membuat booking, pembayaran, email atau check-in. Jangan jalankan pada server bersama/development yang sedang dipakai demo pengguna.
