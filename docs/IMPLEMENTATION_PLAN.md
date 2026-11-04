# Rencana bertahap dan QA

Gate saat ini: persetujuan PRD, flows, architecture, ERD dan design system. Tidak memulai coding sebelum persetujuan pengguna.

| Fase | Hasil | Verifikasi sebelum lanjut |
|---|---|---|
| 0–1 — selesai dokumentasi | Inspeksi kit, requirements, dokumen proposal | Kelengkapan dokumen dan asumsi; bukan validasi aplikasi |
| 2 — foundation | Next.js, tokens, primitives, layouts, Auth/role boundaries, schema/RLS awal, adapter demo bila perlu | Build/typecheck, role access dan env setup |
| 3 — discovery | Homepage, search/filter, detail dan kategori; seed fiktif | Filter, unpublished privacy, responsive dan empty/error |
| 4 — seat/booking | SVG/list, RPC hold, quota, expiry, Realtime | Race same-seat tepat satu sukses, rollback multi-seat, sold/ineligible ditolak, expiry tanpa cleanup, sales closed |
| 5 — checkout/ticket | Form, pricing snapshot, payment simulator, issuance, QR/My Tickets/print | Harga server, retry idempotent, late payment ditolak, failed release, tiket hanya sekali, akses pemilik, scan QR |
| 6 — organizer | CRUD/publish, inventory, analytics, tabel dan CSV | Assignment, quota >= sold+hold, sold seats aman, revenue hanya paid, CSV scope/formula escaping |
| 7 — check-in | Kamera/manual, preview dan confirm atomik | Valid/used/invalid/unpaid/wrong-event/revoked, concurrent scan satu sukses, unauthorized ditolak, camera fallback |
| 8 — QA/polish | Regression, aksesibilitas, performance, README/setup dan demo walkthrough | E2E attendee/organizer/staff, RLS identities, mobile 360/390, tablet 768, desktop 1280, keyboard/focus/contrast, jaringan putus/reconnect |

Gunakan runner yang tersedia saat setup; bila kosong usulkan Vitest untuk unit/integration dan Playwright untuk E2E. Integration concurrency/RLS wajib memakai PostgreSQL/Supabase aktual dengan dua session berbeda; mock tidak dianggap bukti. Test status pembayaran/expiry memakai waktu batas termasuk tepat expires_at. Tambahkan race payment versus cleanup/reserve dan kuota kategori lintas kursi.

Setiap fase menghasilkan ringkasan perubahan, file berubah, tes yang benar-benar dijalankan beserta hasil, keterbatasan dan fase berikutnya. Bug mencatat langkah reproduksi/severity/fix; jangan menyatakan lolos sebelum tes berjalan. Persetujuan awal mengizinkan implementasi berurutan; keputusan material baru didokumentasikan dan dibahas bila memengaruhi lingkup.

## Review yang diminta
Persetujuan terhadap cakupan MVP dan visual; terutama usulan hold 10 menit, maksimum 6 kursi/satu kategori, login sebelum reserve, fee Rp0, gagal bayar melepas kursi, dan mode demo bila kredensial belum tersedia. Nama final SummaPass mengikuti instruksi pengguna.

## Status verifikasi saat dokumen dibuat
MASTER_PROMPT.md, README kit dan delapan SKILL.md telah dibaca. Root awal tidak memiliki app/package manifest atau Technical Brief terpisah. Dokumen Markdown ditulis; belum ada build, database, migration, tes aplikasi, maupun rendering Mermaid yang dijalankan.
