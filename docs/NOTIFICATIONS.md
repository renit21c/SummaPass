# Tahap 3 Orang 1: notifikasi, antrean email dan pengingat

Branch: `feature/notifications-backend`, berdasarkan commit Tahap 2 `a074e2a`. Jika PR Tahap 2 belum masuk main, perubahan Tahap 3 bergantung pada branch Tahap 2. Jangan menghapus atau mengulang migrasi yang sudah diterapkan.

## Yang sudah dibuat

- Notifikasi per akun di database, termasuk baca satu, baca semua, bersihkan secara soft dismiss, unread count, dan pagination cursor. Browser tidak lagi menampilkan contoh notifikasi lewat localStorage.
- Notifikasi reservasi dibuat dan pembayaran berhasil dari trigger transaksi. Satu booking yang dikonfirmasi berulang tetap menghasilkan satu notifikasi dan satu email outbox.
- Perubahan judul, jadwal atau lokasi acara memberi notifikasi kepada pemesan yang sudah confirmed.
- Pengingat reservasi pada sisa waktu <=2 menit, dan pengingat acara pada <=24 jam sebelum mulai. Scheduler harus dipanggil tiap menit. Pemesan yang membeli dalam 24 jam terakhir mendapat pengingat pada putaran berikutnya, bukan tepat 24 jam sebelum mulai.
- Preferensi pengingat booking, pengingat acara dan email pengingat. Menonaktifkan preferensi email di profil akun yang sudah ada juga menghentikan email pengingat. Email transaksi dan tautan tiket yang diminta sendiri tetap terpisah dari pengingat opsional.
- Kirim ulang tautan tiket ke email akun pemesan yang terverifikasi, maksimal satu permintaan per60detik dan5permintaan dalam24jam per akun. API tidak meneruskan tiket ke alamat lain.
- Antrean email, lease worker, dedup, retry terbatas, payload immutable dan riwayat status per tiket. Pesan email berisi tautan halaman yang memerlukan login, tanpa token QR atau data attendee.
- Adapter Resend melalui HTTP; tidak ada SDK atau dependency baru. Tidak ada email nyata dikirim saat implementasi/pengujian.

## Model data dan transaksi

Migrasi `supabase/migrations/202611060011_notifications.sql` menambahkan:

| Tabel | Kegunaan dan akses |
| --- | --- |
| notifications | Relasi pemilik/event/booking/tiket, kind, dedup_key unik, title/message/link, waktu, read_at dan dismissed_at. RLS baca hanya pemilik; mutasi melalui RPC. |
| notification_preferences | Tiga pilihan boolean per pemilik. RPC memakai auth.uid(), tidak menerima ID akun dari browser. |
| notification_outbox | Satu job email per notifikasi; status, attempts, next_attempt_at, first_attempt_at, lease_token, lease_until, payload, provider_id dan last_error. Tidak ada akses browser. |

Trigger membuat notifikasi/outbox dalam transaksi booking/payment yang sama. Jika transaksi database rollback, notifikasi juga rollback. Panggilan penyedia email dilakukan worker setelah commit, sehingga kegagalan penyedia email tidak mengubah pembayaran, tiket atau check-in. Setelah status CONFIRMED diubah, trigger outbox berjalan sebelum insert tiket; tiket dan outbox baru terlihat worker ketika transaksi penerbitan seluruhnya commit.

Worker claim maksimal5job memakai FOR UPDATE SKIP LOCKED, lease5menit dan token baru setiap claim. Ack dari worker lama tidak diterima. Resend memakai `Idempotency-Key: summapass/{jobId}` dengan payload email yang disimpan sebelum mengirim dan dipakai ulang persis sama saat retry. Pergantian email akun membatalkan retry ke alamat lama, bukan mengirim ke email yang sudah berubah.

Resend menyimpan idempotency key24jam. Sistem menghentikan retry setelah23jam dari claim pertama agar replay tidak melewati jendela tersebut. Retry maksimal5attempt; jeda30detik,120detik,600detik, lalu3600detik. Timeout HTTP8detik, HTTP408/429/5xx serta konflik concurrent idempotency dianggap sementara; error provider permanen masukFAILED. Error tidak menyalin isi respons penyedia, email akun atau credential ke log/respons API.

SENT berarti provider menerima pesan, bukan bukti tiba di inbox. Belum ada webhook delivered/bounced atau receipt tracking. Kasus provider menerima email tetapi ack database gagal ditangani retry dengan key dan payload yang sama; setelah batas23jam, periksa provider secara manual sebelum melakukan tindakan baru.

Sebelum network call, worker memeriksa ulang: status dan expiry booking, pembayaran PAID, tiket ACTIVE, event masih sesuai jadwal, serta preferensi pengingat. Pengingat untuk event unpublished atau sudah mulai dilewati. Ada celah waktu singkat antara pemeriksaan terakhir dan network call; tidak ada transaksi database yang ditahan selama jaringan email. Pembayaran yang terjadi setelah email sudah dikirim tidak bisa menarik kembali email tersebut.

State email: PENDING -> PROCESSING -> SENT / RETRY / FAILED / SKIPPED. Lease yang habis dapat diklaim ulang sampai batas retry. SKIPPED menyimpan alasan seperti NO_LONGER_ELIGIBLE, PREFERENCE_DISABLED, VERIFIED_EMAIL_REQUIRED atau RECIPIENT_CHANGED.

## API untuk integrasi tim

| Metode | Endpoint | Hasil |
| --- | --- | --- |
| GET | `/api/notifications?limit=50&cursor={uuid}` | `{items, unreadCount, nextCursor}`;limit1..100, cursoropsional |
| PATCH | `/api/notifications` | `{action:"read",id}`, `{action:"read_all"}` atau `{action:"clear"}` |
| GET/PUT | `/api/notifications/preferences` | `{bookingReminders,eventReminders,emailReminders}`; PUT mengirim tiga boolean |
| POST | `/api/tickets/{id}/resend` | Body `{key:"uuid"}`; HTTP202 `{queued:true,deliveryId,message}` |
| GET | `/api/tickets/{id}/deliveries` | Array id/status/attempts/createdAt/sentAt/errorCode. Hanya tiket pemilik; tanpa payload penerima. |
| POST | `/api/internal/notifications/run` | Scheduler + worker, header Authorization Bearer CRON_SECRET; tidak memakai sesi browser |

API akun memerlukan login dan mutasi memakai Origin yang sama. Body maksimal4KB termasuk streaming. UUID dan payload divalidasi. HTTP401 sesi tidak ada,403Origin salah,404objek bukan milik pengguna/tidak ditemukan,409konflik/mode demo email tidak didukung,429rate limit,503database/configuration gagal. Retry permintaan resend memakai key UUID yang sama; jangan mengganti key saat hasil request belum diketahui.

Hook UI yang sudah ada membaca100notifikasi terbaru dan polling30detik, juga refresh saat fokus dan setelah mutasi. Endpoint mendukung pagination; tombol muat halaman selanjutnya dan UI pengaturan preferensi dapat ditambahkan Orang2. Halaman `/notifications` memerlukan login. Error database ditampilkan sebagai error, tidak diganti contoh demo. Mode demo mengambil notifikasi dari booking/payment sebenarnya di demo store dan menyimpan state baca/preferensi per akun di `.data/notifications.json`; reminder demo dibuat ketika daftar dibaca. Demo bukan worker pengiriman email dan bukan bukti persistensi transaksi produksi.

## Setup Supabase development

1. Pastikan migrasi001 sampai010 sudah diterapkan. File denah010 yang pernah dijalankan dengan nama009 tidak perlu diulang.
2. Jalankan **seluruh** isi `202611060011_notifications.sql` sekali melalui Supabase SQL Editor. File berisi BEGIN/COMMIT. Migrasi ini tidak memanggil provider email atau membuat job dari semua pembayaran historis. Scheduler tetap dapat menemukan event mendatang yang memenuhi syarat.
3. Jalankan `node scripts/supabase-check.mjs --notifications`. Perintah ini hanya membaca metadata dan memastikan RPC anonim ditolak; tidak menjadwalkan atau mengirim email.
4. Set `SUMMAPASS_AUTH_MODE=supabase` dengan konfigurasi Supabase yang sudah dipakai tahap sebelumnya.
5. Buat nilai acak minimal32karakter untuk `SUMMAPASS_CRON_SECRET`, simpan di `.env.local` dan secret deployment. Jangan memakai service-role key sebagai cron secret.
6. Set `SUMMAPASS_APP_URL` ke origin aplikasi, contoh `http://127.0.0.1:3000` saat lokal dan HTTPS saat deployed. Tidak ada path, username/password atau query.
7. Biarkan `SUMMAPASS_EMAIL_ENABLED=false` untuk menguji in-app dan scheduler tanpa pengiriman nyata. Panggil POST `/api/internal/notifications/run` menggunakan Bearer secret. Walaupun email disabled, pengingat in-app tetap dibuat; email yang dijadwalkan tetap PENDING dan attempts tidak bertambah.
8. Untuk mengaktifkan email, siapkan akun Resend, sender/domain terverifikasi, `RESEND_API_KEY` dan `SUMMAPASS_EMAIL_FROM`, lalu set `SUMMAPASS_EMAIL_ENABLED=true`. Gunakan akun dan alamat uji yang kamu kendalikan untuk uji staging pertama. Restart aplikasi setelah mengubah env.
9. Konfigurasikan scheduler eksternal tiap menit untuk memanggil endpoint POST beserta Authorization. Repo tidak otomatis mengaktifkan cron hosting atau mengirim email saat `npm run build`.

Contoh PowerShell setelah secret dimuat ke environment:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/internal/notifications/run" -Headers @{ Authorization = "Bearer $env:SUMMAPASS_CRON_SECRET" }
```

Tanpa penyedia/sender/URL yang lengkap, worker tidak mengklaim job dan mengembalikan `emailEnabled:false`. Jika flag enabled tetapi format APP_URL salah, perbaiki konfigurasi sebelum mencoba lagi. Kunci tetap server-only; jangan memakai prefix NEXT_PUBLIC untuk cron secret atau API key email.

## Pemeriksaan operasional

Jalankan query berikut lewat SQL Editor berprivilege untuk melihat kondisi antrean tanpa menampilkan isi email:

```sql
select status, count(*) as jobs, min(created_at) as oldest
from public.notification_outbox group by status order by status;

select id, status, attempts, last_error, created_at, sent_at
from public.notification_outbox
where status in ('FAILED','RETRY') order by created_at desc limit 50;
```

Tidak ada endpoint publik untuk menjalankan ulang dead letter. Periksa provider dan penyebab kegagalan sebelum intervensi. Jangan mengubah key/payload dan mengirim ulang otomatis setelah batas idempotency karena bisa menghasilkan duplikasi. Email lama dalam statusPENDING yang belum pernah dicoba dapat dikirim setelah email diaktifkan; periksa antrean development sebelum aktivasi. Pengingat yang sudah kedaluwarsa dilewati saat diproses.

## QA dan batas rilis

Tes lokal mencakup RLS lintas akun/staff/anon, notifikasi transaksi idempotent, scheduler dedup, preferensi, payment sesudah enqueue, revocation, perubahan jadwal, cooldown/day limit, lease reclaim dan ack lama, payload immutable, retry cap, timeout provider, jendela23jam, escapingHTML dan autentikasi cron. Tes provider memakai transport mock; tidak mengirim email nyata. PGlite bukan bukti beberapa koneksi PostgreSQL remote.

Sebelum rilis: uji migration011 di development, dua worker konkuren di staging, pembayaran vs pengingat pada batas expiry, rate limit antar-sesi, akun dengan email belum terverifikasi, opt-out sesudah enqueue, restart worker, serta penerimaan pesan pada inbox uji. Validasi juga cronhosting, senderdomain dan pengiriman retry setelahtimeout. Notifikasi undangan tim, pembatalan/refund acara, push/WhatsApp, marketing, UI preferensi dan webhook delivery belum menjadi bagian implementasi ini.

Rujukan integrasi: [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email) dan [Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys).


## Tambahan PDF pada email

Permintaan pengguna berikutnya memperluas email tiket menjadi PDF siap cetak. Lihat [TICKET_PDF_EMAIL.md](TICKET_PDF_EMAIL.md). Migrasi012 memperbesar batas payload dan menambahkan scope metadata/RPC attachment. Email tiket baru memuat satu PDF booking atau satu PDF tiket untuk resend; payload baru termasuk lampiran dienkripsi dengan kunci turunan dari SUMMAPASS_TICKET_KEY_V1. Batas tidak menyimpan QR terbuka pada outbox tetap dipertahankan. Lampiran email sendiri berisi QR untuk dicetak sesuai permintaan pengguna, sedangkan tautan halaman tetap memerlukan login. Job lama yang payload-nya sudah tersimpan tidak diubah saat retry. Jalankan ulang permintaan resend untuk mendapat PDF dari tiket lama.


## Menjalankan tes lokal

`npm test` membatasi jumlah file tes paralel menjadi2 agar beberapa instance PostgreSQL PGlite tidak menghabiskan memori sekaligus pada Windows. Seluruh skenario dan pengujian request bersamaan di dalam masing-masing test tetap dijalankan. Pembatasan ini tidak mengubah concurrency server aplikasi atau worker email.
