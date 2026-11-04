# SummaPass

Prototipe tiket event fiktif di Summarecon Mall Bandung. Tahap yang tersedia: discovery/detail event, login demo dan adapter Supabase Auth, akun, pemilihan kursi, reservasi 10 menit, pembayaran simulasi berhasil/gagal, Tiket Saya dan QR e-ticket, serta cetak/simpan PDF melalui dialog browser.

Monitoring organizer, editor event/cover dalam mode demo lokal, serta check-in petugas dengan kamera/manual tersedia. Penugasan petugas demo masih terbatas pada tiga event awal. Tidak ada pembayaran nyata. Seluruh event dan harga adalah data demo. Nama SummaPass ditetapkan pengguna; ketersediaan merek/domain belum diverifikasi.

## Menjalankan
Dari folder ini:

```text
npm install
npm run dev
```

Untuk build produksi: `npm run build`, lalu `npm run start`. Script development dan build memakai Webpack karena masalah child process CSS Turbopack pada lingkungan Windows tugas ini. Preview tugas saat ini memakai port 3001. Hindari menjalankan dua proses demo pada host yang sama sekaligus karena cookie browser dibagi antaraport, sedangkan sesi/inventory tersimpan terpisah dalam proses.

Tanpa environment, mode default adalah demo lokal satu proses. Login melalui tombol pengunjung demo tanpa data pribadi. Restart menghapus sesi, booking, payment dan tiket demo. Jangan gunakan mode ini untuk produksi multi-instance.

## Supabase
Baca [setup autentikasi](docs/AUTH_SETUP.md), [reservasi](docs/RESERVATIONS.md), serta [pembayaran dan tiket](docs/PAYMENTS_TICKETS.md). Terapkan lima migrasi berurutan lalu seed.sql. Kredensial Supabase belum tersedia dan tidak ada proyek remote yang diubah. Issuance tiket di mode Supabase memerlukan service-role key dan encryption key server-only; jangan commit secret atau memakai prefix NEXT_PUBLIC.

Katalog discovery masih memakai data fiktif lokal. Auth/inventori/booking/payment/tiket memakai adapter yang dipilih secara eksplisit. Tidak ada fallback diam-diam saat Supabase gagal.

## Pengujian
`npm test` menjalankan 20 test cases terisolasi untuk foundation, RLS/RPC PostgreSQL WASM, reservasi, pembayaran, encryption dan QR decode. `npm run typecheck` memeriksa TypeScript.

`node tests/auth-http.mjs`, `node tests/reservations-http.mjs` dan `node tests/payments-http.mjs` memeriksa preview port 3001. Jalankan smoke test reservasi/payment pada proses demo baru tanpa booking existing karena memakai kursi fixture tetap; test payment meninggalkan kursi sold sampai restart. Ini bukan pengujian layanan Supabase remote atau locking dua koneksi PostgreSQL asli.

Check-in: baca [alur dan batas pengujian](docs/CHECK_IN.md). `tests/check-in-http.mjs` memakai port 3002 untuk pengujian terpisah. Metadata event dan cover demo tersimpan di `.data/`; sesi dan transaksi tetap di memori. Editor dan Storage Supabase masih pending.

## Dokumen produk
[PRD](docs/PRD.md), [user flows](docs/USER_FLOWS.md), [arsitektur](docs/ARCHITECTURE.md), [database/ERD](docs/DATABASE.md), [design system](docs/DESIGN_SYSTEM.md), [rencana](docs/IMPLEMENTATION_PLAN.md) dan [status/hasil verifikasi](docs/PROGRESS.md).

Sumber: ../MASTER_PROMPT.md dan delapan ../.agents/skills/*/SKILL.md. Instruksi pengguna mengatur gate persetujuan, nama aplikasi, gaya tanpa em dash dan tanpa eyebrow. Technical Brief terpisah tidak tersedia. Warna merupakan inspirasi, bukan spesifikasi brand resmi.


## Organizer monitoring
Dashboard organizer monitoring tersedia di /organizer. Di akun demo, pilih Buka workspace demo, atau pilih organizer demo saat login. Server memberi tiga event fiktif tetap; attendee biasa tetap ditolak dan mode Supabase tetap memakai event_access. Lihat docs/ORGANIZER.md untuk migrasi004, hitungan metrik, filter dan ekspor. Edit/publish event, pengaturan kategori dan check-in masih berikutnya.
