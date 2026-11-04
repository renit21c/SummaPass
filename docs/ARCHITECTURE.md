# Proposal arsitektur

Next.js App Router, React, TypeScript strict, Tailwind, shadcn/ui, Supabase Auth/PostgreSQL/Storage/Realtime. Zod untuk input server; React Hook Form untuk form kompleks; Recharts, qrcode.react, html5-qrcode atau ekuivalen terawat, date-fns, Lucide. Versi kompatibel dipilih dan diverifikasi saat foundation; belum ada package manifest/lockfile pada repository awal.

Server Components untuk pembacaan/layout; Client Components hanya interaksi peta, form, countdown, chart, QR dan kamera. Route Handlers menjadi pola mutasi konsisten. Feature services memisahkan aturan bisnis dari UI. Browser tidak boleh mengirim total/role yang dipercaya server.

```text
src/app/(public)                 homepage, events, event detail
src/app/(auth)                   login
src/app/(attendee)               checkout, bookings, my-tickets
src/app/organizer                dashboard dan pengelolaan
src/app/staff                    scanner event-scoped
src/app/api                      route handlers tervalidasi
src/features                    events, seats, bookings, payments, tickets, check-in
src/components/ui               primitives dan tokens
src/lib                         auth, supabase, repository adapters
supabase/migrations              schema, constraints, RLS dan RPC
docs                            keputusan dan QA
```

Browser → Route Handler (session, Zod, assignment) → service → RPC transactional. RLS tetap berlaku; RPC privileged memakai search_path tetap, pemeriksaan auth.uid/assignment, grant terbatas dan tidak menerima role yang dipercaya dari client. Service-role key hanya untuk tugas server yang benar-benar perlu, tidak untuk melewati authorization rutin.

RPC: reserve_booking, expire_booking, confirm_simulated_payment, validate_ticket, confirm_check_in. Semua mutasi kritis mengunci data terkait dan mengembalikan structured outcomes. Realtime hanya event-scoped inventory publik tanpa PII; reconnect/conflict memuat ulang snapshot authoritative. Log tidak merekam raw QR token.

Mode Supabase adalah target integrity. Jika belum ada environment, adapter demo server terpisah memakai seed fiktif dan banner permanen; persistence/restart dan concurrency terbatas dijelaskan pada README. Mode demo tidak menjadi bukti lulus RLS/transaction integration tests. Tidak ada fallback diam-diam dari production ke demo.

QR: random 256-bit, unique hash untuk lookup server; raw token dienkripsi server-side dengan kunci environment agar QR dapat ditampilkan ulang kepada pemilik. Ciphertext hanya dapat dibaca service pemilik tiket, bukan public/Realtime. Kunci tidak berada di browser; rotasi perlu versi kunci. QR hanya memuat token opaque, bukan PII. Manual reference tidak menjadi akses publik tiket; endpoint staff memerlukan assignment dan rate limit.

Environment yang akan diperlukan: URL dan publishable Supabase key, server token-encryption key, konfigurasi site URL; privileged key opsional server-only. Storage poster publik tervalidasi, e-ticket tidak disimpan publik. Deployment web HTTPS diperlukan untuk kamera. Setup/deployment belum dilakukan.
