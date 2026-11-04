# Integrasi Supabase

Implementasi pada branch codex/supabase-integration. Mode demo tetap tersedia. Katalog, editor event, cover, reservasi, pembayaran simulasi, e-ticket, laporan organizer dan check-in memiliki adapter Supabase. Tidak ada fallback ke katalog seed lokal ketika mode Supabase gagal.

## Persiapan development

1. Gunakan Node.js 22 dan jalankan npm install.
2. Buat proyek Supabase development atau staging. Jangan gunakan data peserta nyata untuk smoke test.
3. Jalankan migrasi 001 sampai 007 berurutan dari supabase/migrations. Migration 007 membutuhkan schema Storage Supabase; kegagalan tidak boleh dilewati. Untuk proyek yang sudah memakai 001-005, cukup terapkan 006 dan 007.
4. Jalankan supabase/seed.sql hanya pada development. Seed hanya membuat katalog/venue fiktif, tidak membuat akun atau memberi hak organizer.
5. Buat empat akun uji berbeda lewat Supabase Authentication: organizer, dua pembeli, dan petugas. Verifikasi akun uji sebelum login. Profil dibuat otomatis oleh trigger.
6. Melalui SQL Editor dengan akses pemilik proyek, berikan event_access ORGANIZER untuk akun organizer dan STAFF untuk akun petugas pada event development yang dipilih. Tidak ada endpoint self-promotion.
7. Salin .env.example menjadi .env.local dan isi nilai server yang diperlukan. Set SUMMAPASS_AUTH_MODE=supabase. Gunakan URL proyek, publishable key, service-role key, dan SUMMAPASS_TICKET_KEY_V1. Jangan commit file ini.
8. Buat kunci tiket sekali dengan node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))". Simpan kunci 64 karakter hex di .env.local dan secret manager. Jangan menggantinya selama tiket dengan versi v1 masih digunakan; backup kunci terpisah dari database. Service-role dan kunci enkripsi tidak boleh memakai prefix NEXT_PUBLIC.
9. Jalankan npm run supabase:check. Perintah ini hanya membaca metadata dan menguji penolakan RPC anonim. Setelah lulus, mulai aplikasi dan uji alur login sampai check-in.

Contoh assignment di SQL Editor, ganti kedua UUID dengan akun dan event development yang benar:

```sql
insert into public.event_access(event_id,user_id,role)
values ('UUID_EVENT','UUID_ORGANIZER','ORGANIZER')
on conflict do nothing;
insert into public.event_access(event_id,user_id,role)
values ('UUID_EVENT','UUID_STAFF','STAFF')
on conflict do nothing;
```

## Migrasi baru

006 menambahkan metadata katalog, RPC public_catalog, organizer_event, manage_event, audit_logs, snapshot event pada tiket, DTO organizer lengkap, judul pada booking dan pendaftaran event_seats ke publication Realtime bila publication tersedia. public_catalog hanya membaca PUBLISHED walaupun pemanggil organizer. Serializer internal tidak dapat dipanggil browser.

manage_event memeriksa auth.uid dan assignment. Create memakai venue dari event yang sudah ditugaskan ke organizer, membuat draf dengan Front/Regular, kategori, hubungan section dan 48 event_seats dalam satu transaksi. Update, status, dan cover mengunci event dengan urutan yang sama seperti reserve/payment. Edit jadwal/lokasi dengan booking confirmed atau hold aktif ditolak. Kuota tidak boleh kurang dari kursi sold plus hold aktif. ID kategori, slug dan snapshot harga booking tidak diganti. Setiap keberhasilan mutasi menyimpan actor, waktu, before dan after. Perubahan gagal tidak meninggalkan audit sukses.

007 membuat bucket event-covers privat dengan batas WebP 5 MB. Nama objek adalah EVENT_UUID/FILE_UUID.webp, sedangkan URL aplikasi tetap /api/covers/EVENT_UUID_FILE_UUID.webp. Organizer assigned dapat insert dan membaca objek milik eventnya. Publik hanya membaca objek yang sedang direferensikan event PUBLISHED. Objek tidak ditimpa. Delete hanya untuk objek tidak terpakai pada event nonarsip yang ditugaskan. Linking cover membutuhkan objek yang sudah diupload. Tidak ada service-role key pada alur cover.

Upload server memeriksa role dan assignment sebelum membaca body, membatasi body termasuk request chunked, memvalidasi decoder gambar dan menormalisasi ke WebP. Gagal linking mencoba membersihkan objek baru; RLS tetap melarang penghapusan cover yang sudah aktif. Objek orphan yang tidak dapat dibersihkan, misalnya karena event diarsipkan bersamaan, perlu housekeeping administrator setelah memeriksa referensi. Tidak menghapus data historis secara otomatis.

## Pengujian remote yang sudah disiapkan

Isi nama berikut hanya di .env.local staging, dengan empat akun berbeda:

```text
SUMMAPASS_TEST_ORGANIZER_EMAIL=
SUMMAPASS_TEST_ORGANIZER_PASSWORD=
SUMMAPASS_TEST_BUYER1_EMAIL=
SUMMAPASS_TEST_BUYER1_PASSWORD=
SUMMAPASS_TEST_BUYER2_EMAIL=
SUMMAPASS_TEST_BUYER2_PASSWORD=
SUMMAPASS_TEST_STAFF_EMAIL=
SUMMAPASS_TEST_STAFF_PASSWORD=
SUMMAPASS_ALLOW_REMOTE_TESTS=true
```

Jalankan npm run supabase:smoke. Tanpa flag explicit, script menolak berjalan. Script membuat event staging baru dan penugasan staff untuk event uji, mengupload cover, memeriksa privasi draf/publik, menjalankan dua client pembeli bersamaan, konflik multi-seat, retry pembayaran, konfirmasi check-in bersamaan, akses lintas pemilik, reconnect, serta snapshot tiket setelah perubahan/unpublish. Script tidak mencetak password atau token QR. Catatan uji disimpan untuk audit dan event disembunyikan saat selesai; tidak melakukan hard delete transaksi. Jangan arahkan script ini ke production.

Untuk bukti restart aplikasi, setelah smoke test masuk sebagai akun pembeli pemenang, buka booking/tiket, restart Next.js dan pastikan catatan tetap terbuka. Untuk expiry, buat hold staging lain dan uji tepat pada/setelah expires_at. Kamera ponsel, printer, kehilangan koneksi, dua staff berbeda dan kebijakan Storage pada layanan asli tetap perlu diperiksa.

## Pemeriksaan lokal dan batas

npm test mencakup SQL PostgreSQL melalui PGlite dengan shim Auth dan tabel Storage untuk menguji policy/RPC. Tests ini tidak menguji pengiriman byte ke Supabase Storage, Auth remote atau locking dua koneksi PostgreSQL asli. cover decoder dan batas multipart diuji terpisah. npm run typecheck dan npm run build memeriksa aplikasi.

Tidak ada proyek Supabase remote yang dibuat/diubah pada tahap ini karena koneksi belum tersedia. Jangan menandai remote smoke atau persistensi restart sebagai lulus sebelum benar-benar dijalankan.

Editor masih dua kategori/section 24 kursi per kategori. Venue/kategori bebas dan undangan/assignment lewat UI adalah pekerjaan berikutnya. Create pertama memerlukan assignment organizer awal dari administrator. Akun demo dan katalog .data tidak diimpor sebagai akun/transaksi production. Existing tickets dibackfill snapshot dari metadata saat migrasi, bukan metadata historis yang sudah berubah sebelum migrasi.

## Rilis dan pemulihan

Backup database dan konfigurasi key sebelum menerapkan migrasi pada proyek berisi transaksi. Lakukan percobaan di staging lebih dahulu. Migrasi ini menambah schema dan tidak menghapus transaksi. Jika rilis aplikasi gagal, kembali ke versi aplikasi sebelumnya tanpa menjatuhkan tabel audit/snapshot atau menghapus Storage bucket. Uji restore backup dan rotasi key memakai rencana terpisah. Tidak ada deployment atau backup otomatis yang dibuat oleh perubahan ini.
