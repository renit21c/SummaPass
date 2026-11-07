# Sisa tugas Orang 1

Branch: `feature/backend-operations`. Migrasi baru: **013, 014, 015**, dijalankan setelah 012. Migrasi lama tidak diubah dan tidak perlu diulang.

## Hasil implementasi

| Tugas | Hasil |
|---|---|
| Undangan petugas | Undang lewat email, berlaku 7 hari, daftar/status, resend dengan cooldown, revoke, penerimaan oleh email terverifikasi yang cocok. Tidak membuat akun atau password untuk penerima. |
| Notifikasi expiry | Transisi EXPIRED membuat satu notifikasi dan outbox; scheduler melepas hold dan memperbarui pembayaran PENDING menjadi EXPIRED. |
| Pembatalan event | RPC atomik, alasan wajib, idempotensi, tiket REVOKED, reservasi dilepas, undangan pending dicabut, notifikasi pembeli. |
| Receipt email | Webhook bertanda tangan, dedup ID, status delivered/delayed/bounced/complained/failed/suppressed, aman terhadap event yang datang tidak berurutan. |
| Operasional antrean | Dashboard per event, filter/status/count/pagination, error code, retry terbatas dan audit alasan. Payload, QR, email penerima dan lease tidak dikirim ke dashboard. |
| Worker lokal | Otomatis ikut `npm run dev` dalam mode Supabase; satu putaran setiap 60 detik, tidak overlap, berhenti bersama server. |
| QA staging | Script race antarkoneksi asli tersedia; perlu proyek staging dan akun uji. Tidak dinyatakan lulus sebelum dijalankan. |

## Aktivasi lokal

1. Jalankan isi file SQL berurutan di SQL Editor proyek development:
   - `202611070013_staff_invitations.sql`
   - `202611070014_event_lifecycle.sql`
   - `202611070015_notification_operations.sql`
2. Pertahankan konfigurasi Supabase, ticket key, sender, Resend API key, app URL dan cron secret yang sudah bekerja. Ticket key tidak boleh diganti sembarangan karena payload lama dan PDF retry masih menggunakannya.
3. `.env.local`: `SUMMAPASS_AUTH_MODE=supabase`. Worker lokal aktif secara default. `SUMMAPASS_LOCAL_WORKER_ENABLED=false` mematikannya. Email hanya dikirim bila `SUMMAPASS_EMAIL_ENABLED=true`.
4. Jalankan `npm run supabase:check -- --seating --notifications --operations`. Pemeriksaan ini hanya metadata dan penolakan akses anonim, bukan transaksi atau kirim email.
5. Restart dengan `npm run dev -- --port 3001`. Worker mengikuti port tersebut. Isi `SUMMAPASS_APP_URL=http://127.0.0.1:3001` agar tautan email sesuai. Jangan menjalankan worker standalone kedua jika worker dev sudah berjalan.
6. Alternatif server saja: `npm run dev:web -- --port 3001`. Jalankan worker terpisah dengan `SUMMAPASS_WORKER_URL=http://127.0.0.1:3001` lalu `npm run notifications:worker`. Sekali jalan: `npm run notifications:once`.
7. Buka edit event organizer. Bagian **Undangan petugas** dan tautan **Antrean email** tersedia. Petugas membuka tautan email, mendaftar/login dengan email penerima, lalu menekan **Terima undangan**.

Worker memerlukan aplikasi dan terminal tetap berjalan. Ini bukan scheduler cloud dan tidak berjalan saat laptop mati. Tidak ada scheduled task Windows atau konfigurasi hosting yang dipasang diam-diam. Startup tidak mengirim email sebelum migrasi 013 sampai 015 lolos preflight. Untuk pengujian pengiriman, gunakan penerima yang diizinkan Resend; pengirim onboarding masih dibatasi akun penguji.

## Kontrak API

Semua endpoint akun memerlukan sesi. Mutasi memerlukan Origin yang sama. Body JSON maksimal 4 KB. UUID, email, panjang alasan dan limit divalidasi. Demo mengembalikan `SUPABASE_REQUIRED` untuk operasional baru.

| Metode dan route | Isi / hasil |
|---|---|
| GET `/api/organizer/events/:id/invitations` | Maksimal 100 undangan terbaru event assigned |
| POST route di atas | `{email, key: UUID}`; idempotensi per organizer, maksimal 50 undangan baru per hari |
| PATCH `/api/organizer/invitations/:id` | `{action: 'revoke' atau 'resend', key: UUID}`; resend minimal 60 detik, maksimal 5 pesan per undangan per hari |
| GET `/api/staff/invitations/:id` | Hanya akun penerima dengan email terverifikasi; tidak memerlukan role staff sebelum menerima |
| POST route di atas | Menerima undangan, menambah akses STAFF untuk event tersebut |
| POST `/api/organizer/events/:id/cancel` | `{reason: 10..1000 karakter, key: UUID}` |
| GET `/api/organizer/events/:id/notifications` | `status`, `cursor`, `limit` 1..100; counts dan metadata antrean |
| PATCH route di atas | `{jobId: UUID, reason: 10..500 karakter}`; antrekan ulang job FAILED yang masih aman |
| POST `/api/webhooks/resend` | Raw body dan signature Svix dari provider; tanpa sesi browser |

Login mempertahankan tautan penerimaan undangan berbentuk UUID yang tepat, termasuk untuk akun yang sudah mempunyai role lain. Destinasi login biasa tetap mengikuti role. Assignment langsung dengan UUID akun tetap tersedia; assignment berdasarkan nama tidak lagi membuat akun dengan password tetap. Pencabutan akses dan check-in memakai event lock yang sama. Check-in memeriksa ulang assignment setelah memperoleh lock.

## Aturan pembatalan dan expiry

Pembatalan hanya oleh organizer assigned, sebelum acara dimulai dan sebelum ada check-in. Flag `cancelled_at`, alasan dan key disimpan; event disembunyikan dan tidak dapat dipublikasikan kembali. Ini berbeda dari unpublish biasa. Pembayaran setelah pembatalan ditolak. Jika pembayaran menang lebih dulu dalam race, tiket yang sudah terbit dicabut oleh pembatalan pada transaksi berikutnya.

Pembayaran yang sudah PAID, booking CONFIRMED dan alokasi SOLD dipertahankan sebagai riwayat akuntansi. Tidak ada refund otomatis atau klaim uang sudah dikembalikan. Hold PENDING dibatalkan dan dilepas. Tiket REVOKED ditolak scanner; job PDF/reminder lama dilewati. Notifikasi pembatalan tetap eligible meskipun semua tiket sudah dicabut. Booking API menambahkan `eventCancelledAt` dan `eventCancellationReason`.

Expiry scheduler memproses maksimal 20 event dan 1000 hold per event pada satu putaran, event lock lebih dulu, serta memperbarui revision inventory. Notifikasi EXPIRED juga dibuat bila expiry dipicu alur transaksi lama. Kunci dedup `expired/<booking>` mencegah duplikasi. Jalur lazy availability tetap berlaku meskipun worker berhenti; kursi expired tidak menunggu cleanup untuk bisa dibeli kembali.

## Webhook Resend

Tambahkan endpoint **`https://alamat-yang-dapat-diakses/api/webhooks/resend`** di Resend dan pilih `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`. Isi `RESEND_WEBHOOK_SECRET` dengan Signing Secret endpoint (`whsec_...`), bukan API key.

Resend tidak dapat mengakses localhost langsung. Untuk tes webhook nyata saat lokal, diperlukan tunnel HTTPS yang sengaja dikonfigurasi, atau staging yang dapat diakses publik. Tanpa itu worker tetap berjalan, tetapi receipt nyata belum masuk. Jangan menganggap SENT sebagai DELIVERED. Pengujian lokal signature tidak memerlukan Resend/tunnel dan menggunakan fixture.

Verifikasi HMAC-SHA256 memakai raw body, `svix-id`, `svix-timestamp`, dan `svix-signature`, timing-safe comparison, toleransi waktu 5 menit, dan batas body 64 KB termasuk request chunked. Hanya metadata provider ID, jenis, dan waktu yang disimpan; body provider, alamat penerima dan isi email tidak disimpan. Event receipt dapat tiba sebelum ack worker: keterkaitan dihitung lewat provider ID ketika ack tersedia. Receipt webhook yang gagal disimpan mendapat 503 agar provider bisa retry.

Status buruk seperti complaint/bounce tidak ditimpa event delivered/sent yang datang terlambat. DELIVERED berarti server email penerima menerima pesan, bukan bukti pengguna membuka atau melihatnya di inbox. Complaint dan bounce tidak memicu pengiriman ulang otomatis.

Referensi implementasi: [verifikasi Resend](https://resend.com/docs/webhooks/verify-webhooks-requests), [jenis event](https://resend.com/docs/webhooks/event-types), [format signature Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual).

## Penanganan kegagalan

Retry operator hanya untuk FAILED, attempts <5, first attempt kurang dari 23 jam, dan belum memiliki provider ID. Alasan dicatat. Retry mempertahankan payload terenkripsi, penerima, PDF, key provider dan attempts sebelumnya. Status SENT, job dengan provider ID, job kedaluwarsa atau exhausted tidak dapat diputar ulang lewat dashboard.

Periksa provider sebelum membuat permintaan resend baru untuk job di luar jendela idempotensi atau hasil yang belum pasti. Dashboard tidak mendekripsi isi email dan tidak menyediakan tombol yang mereset attempts/window. Worker selalu memeriksa eligibility terbaru sebelum mengirim ulang. Kegagalan email tidak membatalkan booking atau pembayaran.

## Verifikasi dan batas yang jujur

`npm test` mencakup PostgreSQL PGlite, identity/RLS/RPC, lifecycle, undangan, retry, receipt, signature/tamper/timestamp/body limit dan transport worker mock. PGlite tetap satu engine. HTTP demo hanya menguji route wiring/Origin/input/auth, bukan bukti transaksi Supabase.

Untuk staging nyata, stop worker agar email fixture tidak dikirim. Gunakan proyek terpisah, empat akun verified yang berbeda, dan konfigurasi `SUMMAPASS_TEST_ORGANIZER_EMAIL/PASSWORD`, `SUMMAPASS_TEST_BUYER1_EMAIL/PASSWORD`, `SUMMAPASS_TEST_BUYER2_EMAIL/PASSWORD`, `SUMMAPASS_TEST_STAFF_EMAIL/PASSWORD`. Set:

```dotenv
SUMMAPASS_ALLOW_REMOTE_TESTS=true
SUMMAPASS_STAGING_WORKER_PAUSED=true
SUMMAPASS_STAGING_SUPABASE_URL=https://PROJECT-STAGING.supabase.co
```

URL konfirmasi harus sama persis dengan NEXT_PUBLIC_SUPABASE_URL. Jalankan `npm run supabase:smoke` untuk race kursi/payment/check-in, Storage dan persistensi, kemudian `npm run supabase:operations:smoke` untuk undangan/accept-revoke, pencabutan akses, expiry dan race payment/cancel dari koneksi HTTP terpisah. Script kedua tidak mengirim email atau menjalankan claim worker. Data uji tetap disimpan sebagai riwayat pada event staging tersembunyi/dibatalkan; jangan mengaktifkan worker untuk fixture tersebut tanpa review antrean.

Checklist operasional yang memerlukan lingkungan sebenarnya:

- Dua sesi browser mengamati Realtime pada kursi sama dan reconnect setelah jaringan putus.
- Email undangan diterima, akun baru diverifikasi, undangan diterima, lalu akses dicabut.
- PDF diterima di inbox dan QR diuji dengan ponsel/cetakan.
- Webhook provider nyata menghasilkan receipt pada dashboard yang benar.
- Backup database dan objek Storage diuji restore pada proyek staging kosong. Verifikasi jumlah booking/tiket/check-in, RLS serta hash/token yang didekripsi dengan ticket key yang sama. Jangan menguji restore ke proyek asal atau menjalankan seed pada database transaksi.
- Simpan ticket key, secrets dan pemetaan Storage sebagai bagian rencana pemulihan terpisah dari repo. Dump database saja tidak memulihkan file Storage.

Belum ada klaim tes race antarkoneksi remote, backup restore, Realtime perangkat atau webhook/inbox nyata lulus oleh perubahan ini. Kode tidak membuat proyek/akun remote, menerapkan migrasi ke database pengguna, atau mengirim email uji tanpa langkah aktivasi tersebut.
