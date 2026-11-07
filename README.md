# SummaPass

Status backend terbaru: undangan petugas, notifikasi expiry/pembatalan, webhook email, antrean terotorisasi dan worker lokal otomatis tersedia. Setup migrasi 013 sampai 015 dan batas pengujian ada di [BACKEND_OPERATIONS.md](docs/BACKEND_OPERATIONS.md). Dokumen PROGRESS mencatat hasil pengujian setiap tahap.

Prototipe tiket event fiktif di Summarecon Mall Bandung. Tahap yang tersedia: discovery/detail event, login demo dan adapter Supabase Auth, akun, pemilihan kursi, reservasi 10 menit, pembayaran simulasi berhasil/gagal, Tiket Saya dan QR e-ticket, serta unduh PDF A4 dan email lampiran e-ticket.

Dashboard organizer, editor event/cover, assignment dan undangan petugas, serta check-in kamera/manual tersedia. Adapter Supabase menyimpan data permanen; mode demo dipisah. Penugasan petugas demo masih terbatas pada tiga event awal. Tidak ada pembayaran nyata. Seluruh event dan harga adalah data demo. Nama SummaPass ditetapkan pengguna; ketersediaan merek/domain belum diverifikasi.

## Menjalankan
Dari folder ini:

```text
npm install
npm run dev
```

Untuk build produksi: `npm run build`, lalu `npm run start`. Script development dan build memakai Webpack karena masalah child process CSS Turbopack pada lingkungan Windows tugas ini. Port default 3000; gunakan `node scripts/dev.mjs --port 3001` untuk port 3001. Worker mengikuti port yang dipilih dan hanya dimulai setelah server siap. Hindari menjalankan dua proses demo pada host yang sama sekaligus karena cookie browser dibagi antaraport, sedangkan sesi/inventory tersimpan terpisah dalam proses.

Tanpa environment, mode default adalah demo lokal satu proses. Login melalui tombol pengunjung demo tanpa data pribadi. Restart menghapus sesi, booking, payment dan tiket demo. Jangan gunakan mode ini untuk produksi multi-instance.

## Supabase
Baca [setup autentikasi](docs/AUTH_SETUP.md), [reservasi](docs/RESERVATIONS.md), serta [pembayaran dan tiket](docs/PAYMENTS_TICKETS.md). Untuk database development kosong, terapkan seluruh migrasi 001 sampai 015 berurutan, lalu seed.sql. Untuk database yang sudah ada, jalankan hanya migrasi yang belum diterapkan. Jangan jalankan ulang seed pada database berisi transaksi. Issuance tiket di mode Supabase memerlukan service-role key dan encryption key server-only; jangan commit secret atau memakai prefix NEXT_PUBLIC.

Katalog, editor event, cover, Auth, inventori, booking, pembayaran, tiket, organizer dan check-in memakai adapter sesuai mode. Tidak ada fallback diam-diam saat Supabase gagal. Setup dan pengujian remote ada di [integrasi Supabase](docs/SUPABASE_INTEGRATION.md).

## Pengujian
`npm test` menjalankan 64 tes lokal untuk foundation, RLS/RPC PostgreSQL WASM, reservasi, pembayaran, undangan, notifikasi, worker, receipt, encryption dan PDF/QR decode. `npm run typecheck` memeriksa TypeScript.

`node tests/auth-http.mjs`, `node tests/reservations-http.mjs` dan `node tests/payments-http.mjs` memeriksa preview port 3001. Jalankan smoke test reservasi/payment pada proses demo baru tanpa booking existing karena memakai kursi fixture tetap; test payment meninggalkan kursi sold sampai restart. Ini bukan pengujian layanan Supabase remote atau locking dua koneksi PostgreSQL asli.

Check-in: baca [alur dan batas pengujian](docs/CHECK_IN.md). `tests/check-in-http.mjs` memakai port 3002 untuk pengujian terpisah. Metadata event dan cover demo tersimpan di `.data/`; sesi dan transaksi tetap di memori. Pemeriksaan metadata Supabase tersedia; hasil lokal bukan bukti remote race, Storage RLS perangkat atau restore backup.

## Dokumen produk
[PRD](docs/PRD.md), [user flows](docs/USER_FLOWS.md), [arsitektur](docs/ARCHITECTURE.md), [database/ERD](docs/DATABASE.md), [design system](docs/DESIGN_SYSTEM.md), [rencana](docs/IMPLEMENTATION_PLAN.md) dan [status/hasil verifikasi](docs/PROGRESS.md).

Sumber: ../MASTER_PROMPT.md dan delapan ../.agents/skills/*/SKILL.md. Instruksi pengguna mengatur gate persetujuan, nama aplikasi, gaya tanpa em dash dan tanpa eyebrow. Technical Brief terpisah tidak tersedia. Warna merupakan inspirasi, bukan spesifikasi brand resmi.


## Organizer monitoring
Dashboard organizer monitoring tersedia di /organizer. Di akun demo, pilih Buka workspace demo, atau pilih organizer demo saat login. Server memberi tiga event fiktif tetap; attendee biasa tetap ditolak dan mode Supabase tetap memakai event_access. Lihat docs/ORGANIZER.md untuk migrasi004, hitungan metrik, filter dan ekspor. CRUD/publish event, cover, check-in dan backend kategori fleksibel tersedia. Editor visual kategori/denah masih tugas lanjutan UI.
