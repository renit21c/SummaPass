# Status implementasi

## Revisi visual sebelum fitur berikutnya
Warna lebih saturated, font Plus Jakarta Sans Variable lokal, poster ilustrasi baru, border/offset shadow, animasi tiket dan ilustrasi, hover card/button, section kuning dan footer ungu. Eyebrow poster dihapus dan kategori detail dipindah setelah judul. Review browser menemukan poster terlalu lebar di tablet, grid diperbaiki dengan minmax(0, ...). Fitur backend belum dilanjutkan sesuai arahan pengguna.

Persetujuan proposal diterima 3 November 2026. Preferensi: tanpa em dash dan tanpa eyebrow pada web.

## Foundation dan discovery awal
Next.js App Router, TypeScript strict, Tailwind v4 pipeline, token CSS terpusat, layout publik responsif, skip link, reduced motion, loading dan not-found. Data event fiktif dipisahkan dari tampilan. Discovery menyediakan pencarian, filter kategori, sorting tanggal/harga dan empty state. Empat detail event dan poster ilustrasi lokal tersedia.

Belum tersedia: Auth, proteksi role/RLS, Supabase migrations, reservasi, transaksi, tiket, dashboard dan check-in. Tombol booking dinonaktifkan dengan penjelasan. Demo tidak mengklaim persistensi produksi. Foundation backend masih perlu dilengkapi sebelum tahap reservasi.

Verifikasi: npm run typecheck lulus; npm run build lulus dan menghasilkan homepage, discovery, empat detail event, serta not-found. Build awal terhalang child process lingkungan terbatas dan berhasil setelah dijalankan dengan izin proses. Belum ada pengujian visual browser, concurrency, RLS atau Auth. Tidak ada deployment.

## Perbaikan overlap detail event
Poster dipindahkan ke wrapper grid tersendiri dengan pembatas ukuran inline dan ruang shadow. Aspect-ratio/min-height poster tidak lagi menentukan lebar kolom. Layout menjadi satu kolom di bawah 900px. Animasi masuk poster tidak memutar batas kotak menuju kolom detail.

Verifikasi aktual: build produksi lulus. Browser memeriksa Little Weekend pada lebar 390, 768, 1024 dan 1280px: overlap false dan horizontal overflow false. Tiga detail event lain diperiksa pada viewport normal: overlap false. Screenshot: detail-layout-fixed.png. Preview diperbarui di port 3001. Fitur berikutnya belum dilanjutkan.

## Foundation autentikasi dan database
Implementasi: /login, /account, logout, guard server untuk organizer/staff, adapter Supabase SSR dan cookie refresh proxy, demo session opaque HttpOnly di memori server. Navigasi Akun saya tersedia. Database foundation meliputi profil, event_access, venue, section, seats, events, ticket_categories, category_sections, indeks, RLS, trigger profil dan seed katalog fiktif. Seluruh penulisan katalog/assignment klien ditolak sampai RPC pengelolaan dibuat.

Pengujian otomatis: 3 test cases lulus, mencakup redirect, konfigurasi fail-closed, migrasi dan seed repeatable, public published-only, pemilik profil, assignment organizer/staff, dan larangan privilege escalation. PostgreSQL dijalankan melalui PGlite dengan shim auth. Tidak ada koneksi/tes Supabase remote karena kredensial belum tersedia. Katalog UI masih lokal; reservasi, pembayaran, tiket, dashboard dan scanner belum dibuat. Setup lengkap di AUTH_SETUP.md.

Verifikasi akhir autentikasi: npm test lulus (3 test cases), build produksi lulus memakai Webpack karena Turbopack mengalami kegagalan child process CSS. Script tests/auth-http.mjs lulus terhadap preview aktual: redirect tamu, cross-origin 403, return URL aman, cookie HttpOnly, akun terbuka untuk sesi sah, organizer/staff ditolak untuk pengunjung, cookie palsu ditolak, logout mencabut sesi. Browser juga berhasil login demo ke /account. Loading dibatasi ke route event agar redirect autentikasi dapat dikirim sebelum streaming. Origin diverifikasi terhadap host browser, bukan URL internal Next yang dinormalisasi. Mode Supabase belum diuji terhadap layanan remote.


Berkas utama tahap ini: src/lib/auth/*, src/lib/supabase/server.ts, src/proxy.ts, src/app/login/page.tsx, src/app/account/page.tsx, src/app/api/auth/*, protected-workspace, halaman organizer/staff, migrasi/seed SQL, tests/foundation.test.ts dan tests/auth-http.mjs. Login browser berhasil; preview akun disimpan di account-preview.png. Pemeriksaan mobile 390px tidak menemukan horizontal overflow. Navigasi tablet dirapikan. Build final lulus setelah perapian CSS. Tahap berikutnya: seat inventory per event, peta SVG/list, reservasi atomik dan expiry.

## Peta kursi dan reservasi
Implementasi: fitur booking dipisah menjadi DTO/validasi, service adapter, demo store server, SeatPicker dan Reservation. Route API inventori, reserve, detail dan cancel; halaman pilih kursi, daftar/detail reservasi; CTA event dan akun dihubungkan. Migrasi 202611030002_reservations.sql menambahkan event_seats, bookings, booking_items, attendees, RLS, unique active allocation dan RPC transactional. Seed diperbarui dengan inventory event.

Verifikasi: npm test lulus 8 test cases. Unit demo mencakup race satu proses, rollback multi-seat, expiry tepat 10 menit, sold/ineligible, duplikat, maksimum6, retry idempotent, pembatalan dan pemilik. SQL sebenarnya dijalankan pada PGlite untuk reserve/retry/conflict/expiry/quota/privacy/sales closed. Tes HTTP dua pengguna pada preview lokal lulus: satu pemenang saat kursi sama, pricing server, multi-seat rollback, owner404, validasi kategori/limit, auth/CSRF, cancel dan rebook. Browser berhasil login, memilih SVG lewat Enter, memasukkan nama fiktif, membuat hold dan membatalkan. Peringatan hydration countdown ditemukan saat QA dan initial state waktu dibuat deterministic untuk perbaikan.

Batas: demo bersifat memori satu proses; SQL multi-koneksi dan Realtime Supabase remote belum diuji; background scheduler belum ada, expiry lazy tidak memblokir inventory. Pembayaran dan e-ticket belum diimplementasikan. Rincian setup dan aturan ada di RESERVATIONS.md.

Verifikasi akhir tahap reservasi: build produksi final lulus. Browser mencoba reservasi melalui SVG keyboard dan alternatif daftar, reload detail hold mempertahankan countdown dan tidak menghasilkan error console baru setelah perbaikan initial clock. Layout pada viewport aktual390px dan1280px: horizontalOverflow=false dan overlap=false. Screenshot tersimpan: seat-map-preview.png dan reservation-preview.png. Alur sampai hold tersedia; belum ada simulasi payment atau issuance QR. Preview akhir aktif di port3001.

## Pembayaran simulasi dan QR e-ticket
Berkas baru: src/features/tickets (DTO, AES-GCM/token helpers, server-only issuer adapter, TicketCard), API booking payment dan owner ticket, halaman my-tickets/list/detail, migrasi003 payments/tickets/ticket_secrets, tests/payments.test.ts dan payments-http.mjs, serta PAYMENTS_TICKETS.md. Berkas diubah: demo store/service/booking DTO, reservation checkout, akun, event detail, FAQ homepage, proxy, environment example dan dependency manifest/lockfile.

Pengujian: 12 test cases lulus, termasuk SQL/RLS PostgreSQL WASM, concurrent payment demo, retry idempotent, failure/expiry/cancel, ownership, AES-GCM wrong-key/tamper dan QR render-rasterize-decode pada 240px. Tes HTTP preview lulus: dua konfirmasi bersamaan tidak menduplikasi tiket, harga browser diabaikan, owner-only QR, private cache, status paid immutable dan gagal bayar melepas kursi tanpa tiket. Build produksi lulus. QA browser menemukan no-referrer terlalu luas mengganggu form login; dibatasi khusus route tiket, route lain same-origin.

Batas: Supabase remote belum dikonfigurasi/diuji; service-role dan encryption key server dibutuhkan hanya untuk issuance/read ciphertext di mode Supabase. Demo tetap ephemeral satu proses. Tombol cetak memakai dialog browser, belum diuji dengan printer/scan perangkat fisik. Organizer dan check-in masih tahap berikutnya. Pembayaran nyata, refund dan transfer tidak tersedia.

QA lanjutan: peringatan hydration pada seat map diisolasi menggunakan Next development diagnostics. Penyebab aktual adalah beberapa child text pada SVG title; diubah menjadi satu template string. Reload diagnostik tidak menghasilkan error baru. Tiket diuji pada viewport390px: QR tetap240px, horizontalOverflow=false, overlap=false. Login browser, reservasi dua peserta, pembayaran berhasil, daftar dua tiket dan detail QR telah dijalankan. Reload halaman e-ticket tidak menghasilkan error baru. Tidak mengklaim scan kamera/printer nyata sudah diuji.

Verifikasi final tahap pembayaran: build produksi final lulus setelah perbaikan SVG title. Login, checkout, penerbitan tiket dan detail QR pada build final berhasil tanpa error render baru. Layout e-ticket390px dan1280px: horizontalOverflow=false, overlap=false, QR240px. Preview e-ticket disimpan di e-ticket-preview.png. Script dev diselaraskan dengan perintah dev --webpack yang sudah dijalankan pada diagnostik. Server diagnostik ditutup; preview produksi port3001 tetap aktif. Tahap berikutnya: dashboard organizer.

## Dashboard organizer monitoring
Berkas: src/features/organizer/core.ts, service.ts, dashboard.tsx; halaman organizer; API export; migrasi004_organizer_dashboard; organizer.test.ts dan organizer-http.mjs; docs/ORGANIZER.md. Auth session/login dan halaman akun ditambah pilihan organizer demo yang terpisah dari produksi. Recharts dipasang untuk grafik.

Tes otomatis:15test cases lulus. Tambahan pengujian: revenue hanya confirmed/paid, pending/failed/outside event dikecualikan, CSV formula/quotes/newlines aman, SQL organizer snapshot menolak attendee dan hanya mengembalikan assigned event. Semua migrasi001-004 dijalankan dengan PGlite untuk uji role organizer. Belum mengubah remote Supabase.

Cakupan: monitoring/analytics, event & inventori read-only, tabel booking/peserta/transaksi, search/filter/sort/pagination/detail dan CSV terotorisasi. Dashboard memperbarui snapshot melalui tombol refresh. Pengeditan/publish/archive event, perubahan harga/kuota, audit dan check-in belum dibangun; tahap monitoring tidak mengklaim CRUD event selesai.

QA lanjutan: SQL inventori diberi pengecualian read untuk organizer assigned, agar event unpublished tetap masuk hitungan inventori dashboard tanpa membocorkan event tersembunyi ke pengunjung. Uji organizer terfokus3kasus lulus setelah perubahan; salah satunya memeriksa event unpublished. Browser: login organizer, ringkasan berisi pembayaran nyata demo, tabel booking, pencarian dan empty state berhasil; tidak ada error console pada pemeriksaan tabel. Layout390px tidak overflow/overlap. Pengeditan event tetap menjadi tahap berikutnya.

Verifikasi final monitoring organizer: build final lulus dan organizer-http.mjs lulus pada preview terbaru. Login organizer demo membuka dashboard, metrik memakai transaksi demo yang benar-benar paid, grafik tersedia, dan screenshot disimpan di organizer-dashboard-preview.png. Console browser pemeriksaan final tidak memiliki error. Preview port3001 aktif. Pengelolaan event/kategori dan check-in tetap belum diimplementasikan; monitoring ini merupakan bagian pertama fase organizer.


## Event editor stage
Local organizer create/edit, cover upload, publish/unpublish/archive, persistent demo catalog, public discovery and custom-event bookings/tickets implemented. See EVENT_EDITOR.md for limits and QA. Supabase mutation/Storage adapter remains pending.


## Check-in petugas
Halaman staff dengan kamera jsQR dan fallback referensi, preview dan konfirmasi server, pencatatan sekali masuk, role demo STAFF terpisah, status e-ticket dan agregat organizer. Migrasi005 menambahkan RLS dan RPC transactional. Validasi kuota dilokalkan dengan min/max input. Rincian dan batas pengujian di CHECK_IN.md. Integrasi editor Supabase/Storage, assignment staff dinamis dan denah fleksibel masih pending.


## Integrasi Supabase lanjutan
Branch codex/supabase-integration menambahkan migrasi006 dan007: katalog publik database, editor event transactional, audit perubahan, snapshot event pada tiket, bucket cover privat dan Storage RLS. Service katalog tidak lagi menggunakan seed lokal pada mode Supabase. Demo store diinisialisasi hanya saat dibutuhkan. Upload dibatasi termasuk request chunked, memakai Storage sesi pengguna dan mencoba cleanup bila linking gagal.

Verifikasi lokal: 25 pengujian lulus dan typecheck lulus. Tambahan pengujian memakai PostgreSQL PGlite dengan shim Auth/Storage, bukan layanan remote. Script supabase:check dan supabase:smoke serta panduan konfigurasi tersedia di SUPABASE_INTEGRATION.md. Kredensial belum tersedia sesuai arahan pengguna; tidak ada proyek remote dibuat atau diubah. Pemeriksaan koneksi melaporkan konfigurasi belum diisi.

Verifikasi akhir integrasi: build produksi lulus; typecheck setelah perbaikan script staging lulus; catalog-http.mjs dan check-in-http.mjs lulus pada preview produksi uji port3002 dengan data terpisah. Script remote smoke menolak berjalan tanpa flag staging explicit. Supabase remote belum dikonfigurasi atau diuji.


## Tahap 2 Orang 1: backend kategori dan denah fleksibel

Branch kerja: feature/flexible-seating-backend. Migrasi010 menambahkan section khusus event, canvas dan kursi fleksibel, kategori/harga/kuota/periode jual/status aktif, optimistic version, audit dan snapshot nama kategori booking. Semua mutasi mengikuti lock row event yang sama dengan reservasi/payment. Topologi terkunci setelah ada riwayat booking; kuota dan section kategori menjaga sold/live holds. Shared sections lama tetap dipakai event lama tanpa terpengaruh denah baru.

API GET/PUT organizer event seating dan POST/PATCH kategori tersedia dengan Zod, Origin check, autentikasi, assignment/RLS dan body streaming maksimal1MB. Public inventory/catalog dan pembaca seat map/list membaca konfigurasi baru. Editor lama tidak menimpa kategori fleksibel. Editor visual kategori/denah merupakan integrasi Orang3 berikutnya. Fitur konfigurasi fleksibel khusus mode Supabase; demo mengembalikan SUPABASE_REQUIRED.

Verifikasi: 42tes lulus, typecheck lulus, build produksi lulus. seating-http.mjs lulus pada preview produksi demo terisolasi port3002: sesi/role, Origin, payload invalid, route wiring dan penolakan demo eksplisit. Tes PostgreSQL memakai PGlite, bukan proyek remote dan bukan uji koneksi paralel sungguhan. Belum QA visual denah custom atau load test2000kursi. Migrasi010 belum diterapkan remote. Kontrak API, petunjuk migrasi, batas fitur serta checklist staging ada di SEATING_API.md; supabase:check -- --seating menambah pemeriksaan metadata010 secara read-only.


## Sinkronisasi main 5708638

Merge terbaru Orang4 untuk koreksi check-in, alasan koreksi, audit dan staff history sudah diambil dari origin/main ke branch feature/flexible-seating-backend dengan fast-forward. Perubahan Tahap2 lokal dikembalikan tanpa konflik. Cadangan stash tetap disimpan. Migrasi denah lokal berganti nomor menjadi010 agar unik terhadap009_check_in_correction; isi SQL tetap sama. Pengguna telah melaporkan pemeriksaan metadata denah pada Supabase berhasil sebelum pergantian nama, sehingga SQL denah tidak perlu dijalankan ulang. Tidak ada migrasi atau perubahan data remote yang dijalankan saat sinkronisasi.


## Tahap 3 Orang 1: backend notifikasi dan pengingat

Branch feature/notifications-backend dibuat dari a074e2a setelah pengguna mengonfirmasi lingkup notifikasi/email/pengingat. Migrasi011 menambahkan notifications, notification_preferences dan notification_outbox, RLS pemilik, trigger reservasi/pembayaran/perubahan event, scheduler pengingat dan transactional outbox. Worker service-role memakai lease, token fencing, payload immutable, provider idempotency dan retry maksimal5 dalam23jam. Adapter Resend disiapkan; email default nonaktif.

Pusat notifikasi dan bell memakai API akun, bukan notifikasi fiktif di localStorage. Endpoint baca/baca semua/clear, preferences, resend dan delivery history tersedia. Resend dibatasi email akun terverifikasi dengan cooldown60detik dan5permintaan per24jam. UI tidak lagi mengklaim email terkirim ketika hanya masuk antrean. Demo memakai booking/payment aktual dengan state per akun tersimpan, tetapi tidak mengirim email.

Verifikasi lokal:53tes lulus, build produksi dan typecheck lulus. notifications-http.mjs lulus pada preview produksi demo3002 terisolasi: login, transaksi, dedup, owner isolation, read/clear, preference persistence, Origin/body limits, cron unauthorized dan explicit demo email rejection. Browser: akun baru tanpa contoh notifikasi; buat booking dan bayar simulasi menghasilkan2notifikasi, baca semua memperbarui badge, filter unread kosong setelah dibaca. Pemeriksaan viewport390/768 tidak overflow horizontal.

Belum menerapkan migrasi011 atau cron ke Supabase remote dan tidak mengirim email nyata. Uji provider masih transport mock, database memakai PGlite. Aktivasi memerlukan migrasi, cron secret, scheduler dan konfigurasi Resend terverifikasi. UI preference/pagination lanjutan serta delivery webhook belum dibuat. Dokumen konfigurasi, kontrak API dan batas rilis ada di NOTIFICATIONS.md. Script supabase-check mendukung --notifications untuk metadata/read-only access checks.


## E-ticket PDF siap cetak dan lampiran email

Permintaan pengguna berikutnya menambahkan PDF pada email tiket dan desain yang mengikuti web. Generator PDF lama yang berisi pola QR ilustrasi diganti PDFKit dengan Plus Jakarta Sans tertanam dan QR vector asli dari qrcode. Unduhan dan email menggunakan generator yang sama. Satu PDF booking maksimal6halaman; resend satu tiket mendapat1halaman. Header oranye, panel pink/mint, aksen ungu, border dan bentuk tiket mengikuti identitas SummaPass. PDF A4 dan teks panjang diverifikasi dari render PNG.

Migrasi012 menambahkan RPC worker untuk record tiket milik booking/owner job, metadata scope dan guard semua tiket lampiran tetap ACTIVE. Payload email baru termasuk PDF dienkripsi AES-GCM dengan HKDF key terpisah, metadata ticketIds diautentikasi, kemudian difreeze. Retry mempertahankan file dan payload yang sama; job lama tetap memakai payload lamanya. Kunci tambahan tidak diperlukan. Batas1MB PDF dan3MB envelope berlaku. Worker memeriksa migrasi012 sebelum claim.

Verifikasi:57tes lulus termasuk render PDF via Poppler+jsQR, Unicode, kepemilikan, snapshot historis, enkripsi, dedup dan bundle dengan tiket dicabut. Setelah perbaikan kompatibilitas renderer server,3tes PDF terfokus kembali lulus, build produksi lulus dan HTTP notifications-http.mjs lulus pada preview demo terisolasi3002. Manifest trace kedua route memuat kedua font. Preview fiktif2halaman tersedia di output/pdf/summapass-e-ticket-preview.pdf dan diabaikan Git. Tidak ada email nyata dikirim atau migrasi remote dijalankan untuk fitur lampiran ini. Pengguna perlu menerapkan012, restart dan membuat request resend baru. Panduan ada di TICKET_PDF_EMAIL.md.


## Review sebelum PR notifikasi dan PDF

Branch diselaraskan ke origin/main847eb74 yang sudah memuat PR Tahap2. Pemeriksaan ulang menemukan runner dengan terlalu banyak proses PGlite dapat kehabisan memori; script npm test kini memakai concurrency2 tanpa mengurangi skenario. Sesudah perbaikan, seluruh57tes lulus dengan0skip, typecheck dan build produksi lulus. HTTP notifications/PDF kembali lulus pada preview demo terisolasi. Audit dependency produksi melaporkan0vulnerability dan pemeriksaan kecocokan secret tidak menemukan key aktual pada kandidat file commit; .env.local, .data dan previewPDF tetap di-ignore. Nomor migrasi unik.

Pemeriksaan read-only Supabase terkonfigurasi memakai supabase-check --notifications lulus termasuk konfigurasi PDF versi2 serta penolakan RPC anonim. Pemeriksaan ini bukan uji transaksi/race remote atau bukti pengiriman PDF ke inbox. PR perlu mendokumentasikan rollout migrasi011dan012, konfigurasi sender, key dan cron sebelum deployment; scheduler tidak diaktifkan oleh PR.
