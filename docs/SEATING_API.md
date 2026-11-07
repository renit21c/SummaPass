# Tahap 2 Orang 1: kategori tiket dan denah fleksibel

Status: backend Supabase dan kontrak API tersedia. Editor visual untuk Orang 3 belum dibuat. Mode demo tetap menggunakan denah bawaan dan mengembalikan `SUPABASE_REQUIRED` untuk konfigurasi fleksibel.

## Penerapan Supabase

Setelah sinkronisasi main `5708638`, migrasi denah diganti nomor dari `202611060009_flexible_seating.sql` menjadi `202611060010_flexible_seating.sql`, karena nomor 009 sudah digunakan migrasi koreksi check-in dari tim. Isi SQL denah tidak berubah. Jika file denah dengan nama lama sudah berhasil dijalankan di SQL Editor, **jangan menjalankan file 010 lagi**. Status pemeriksaan metadata denah sudah dilaporkan lulus oleh pengguna; pengujian transaksi remote masih terpisah.

1. Untuk instalasi baru, pastikan migrasi 001 sampai 009 sudah diterapkan berurutan. Jangan mengulang migrasi yang sudah berhasil.
2. Buka `supabase/migrations/202611060010_flexible_seating.sql`, salin seluruh isinya ke satu tab SQL Editor pada proyek development Supabase, lalu Run. File ini sudah berisi BEGIN dan COMMIT. Tidak perlu menjalankan tiap fungsi secara terpisah.
3. Pastikan `.env.local` memakai `SUMMAPASS_AUTH_MODE=supabase` dan koneksi proyek tersebut. Tidak ada key baru yang diperlukan.
4. Jalankan `npm run supabase:check -- --seating`. Ini hanya pemeriksaan metadata dan penolakan akses anonim, bukan bukti transaksi atau seluruh RLS remote.
5. Restart development server. Masuk sebagai organizer yang ditugaskan ke event.
6. Buat atau gunakan event draf tanpa riwayat booking. Ambil konfigurasi melalui GET di bawah, kemudian simpan denah dan kategori melalui PUT.
7. Setelah konfigurasi benar, publikasikan melalui API event yang sudah tersedia. Uji memilih kursi, reservasi, pembayaran simulasi, dan e-ticket di proyek development.

Migrasi ini diuji lokal dengan PostgreSQL PGlite beserta seluruh migrasi sebelumnya. Migrasi belum diterapkan ke Supabase remote oleh agent. Jangan menjalankan seed kembali pada proyek yang sudah berisi data.

## Aturan data

- Maksimal 20 section, 30 kategori, dan 2.000 kursi per event.
- Nama kategori dan section unik dalam satu event. Label kursi unik berdasarkan section + baris + nomor.
- Ukuran denah 320 sampai 10.000 x 240 sampai 10.000. Posisi kursi bilangan bulat, minimal x=44 dan y=110. Area kursi 44 x 44 tidak boleh bertumpuk atau keluar dari canvas.
- Setiap kategori memiliki nama, harga integer rupiah 0 sampai 100.000.000, kuota, periode jual berzona waktu, section yang diizinkan, dan status aktif.
- Kuota tidak boleh melebihi kapasitas section atau lebih rendah dari tiket terjual + reservasi aktif milik kategori tersebut.
- Periode jual harus berurutan dan selesai paling lambat saat acara mulai.
- Kategori boleh berbagi section, misalnya Early Bird dan Normal. Kuota dihitung per kategori; kepemilikan kursi tetap unik per event, termasuk antar-kategori.
- Penggantian denah hanya pada DRAFT/UNPUBLISHED yang belum pernah memiliki booking. Riwayat booking CANCELLED/FAILED/EXPIRED juga mengunci penggantian geometri.
- Perubahan section kategori ditolak selama kategori memiliki kursi terjual atau reservasi aktif. Setelah hold kedaluwarsa, hold tersebut tidak lagi mengunci section/kuota.
- Nama/harga kategori boleh diperbarui tanpa mengubah nama kategori dan harga pada booking/tiket lama. Snapshot nama lama dibackfill dari nilai saat migrasi, karena perubahan sebelum migrasi tidak memiliki riwayat snapshot.
- Nonaktifkan kategori dengan `active:false`, tanpa menghapus riwayatnya. Booking baru ditolak; hold yang masih valid tetap dapat dibayar. Kategori aktif terakhir pada event terpublikasi tidak bisa dinonaktifkan; sembunyikan event dahulu.
- Semua konfigurasi, reservasi, dan pembayaran mengunci row event yang sama. Unique active event/seat dari migrasi 002 tetap berlaku.
- Perubahan denah/kategori dicatat dalam audit. RLS dan assignment organizer diverifikasi kembali di RPC, bukan hanya di halaman.

## API untuk Orang 3

Semua endpoint memerlukan sesi organizer dan assignment event. Mutasi JSON harus menyertakan header Origin yang sama dengan host aplikasi, serta Content-Type application/json. Batas request termasuk body streaming adalah 1 MB. ID event/kategori berupa UUID.

| Metode | Endpoint | Kegunaan |
| --- | --- | --- |
| GET | `/api/organizer/events/{id}/seating` | Baca versi, ukuran canvas, seluruh section/kursi dan kategori termasuk nonaktif |
| PUT | `/api/organizer/events/{id}/seating` | Ganti seluruh denah dan kategori awal dalam satu transaksi |
| POST | `/api/organizer/events/{id}/categories` | Tambah kategori |
| PATCH | `/api/organizer/events/{id}/categories/{categoryId}` | Ubah kategori, termasuk menonaktifkan |

Respons berhasil adalah `SeatingConfig` lengkap, bukan wrapper. Contoh:

```json
{
  "version": 1,
  "width": 520,
  "height": 570,
  "sections": [{
    "id": "uuid-section",
    "name": "VIP",
    "seats": [{"id":"uuid-seat","row":"AA","number":1,"x":70,"y":140}]
  }],
  "categories": [{
    "id":"uuid-category","name":"VIP","price":150000,"quota":1,
    "salesStart":"2026-11-01T00:00:00+07:00",
    "salesEnd":"2030-12-12T16:00:00+07:00",
    "sections":["VIP"],"active":true
  }]
}
```

Body PUT memakai `expectedVersion` dari GET terbaru, `width`, `height`, `sections` dan `categories` dalam bentuk yang sama, tetapi ID section/kursi/kategori tidak dikirim. Penggantian denah menghasilkan ID baru. Contoh:

```json
{
  "expectedVersion":0,"width":520,"height":570,
  "sections":[{"name":"VIP","seats":[{"row":"AA","number":1,"x":70,"y":140}]}],
  "categories":[{
    "name":"VIP","price":150000,"quota":1,
    "salesStart":"2026-11-01T00:00:00+07:00",
    "salesEnd":"2030-12-12T16:00:00+07:00",
    "sections":["VIP"],"active":true
  }]
}
```

Body POST/PATCH kategori harus berisi seluruh field kategori, ditambah `expectedVersion`. PATCH tidak menerima potongan field saja. Gunakan UUID kategori dari respons GET, bukan nama.

Setiap perubahan konfigurasi menaikkan `version`. Jika respons `VERSION_CONFLICT`, ambil konfigurasi terbaru dan tampilkan ulang perubahan untuk ditinjau. Jangan melakukan retry otomatis yang menimpa perubahan organizer lain. Pembaruan kategori dari editor lama juga menaikkan versi.

| HTTP | Code utama | Tindakan UI |
| --- | --- | --- |
| 400 | INPUT | Tampilkan pesan validasi |
| 401 | AUTH | Minta login |
| 403 | FORBIDDEN | Tidak memiliki assignment organizer atau Origin salah |
| 404 | NOT_FOUND | Kategori tidak ditemukan |
| 409 | VERSION_CONFLICT | Ambil konfigurasi terbaru |
| 409 | LAYOUT_LOCKED / CATEGORY_LOCKED / QUOTA / LAST_CATEGORY / ARCHIVED | Tampilkan alasan dan pertahankan input |
| 409 | SUPABASE_REQUIRED | Aktifkan mode Supabase untuk konfigurasi fleksibel |
| 413 | INPUT | Request terlalu besar |
| 503 | DATABASE | Periksa koneksi atau migrasi, lalu coba lagi |

Contoh respons gagal: `{"code":"VERSION_CONFLICT","error":"Konfigurasi berubah. Muat ulang sebelum menyimpan."}`.

## Integrasi halaman yang sudah ada

`seat_inventory` menambahkan `width`, `height`, `version`, serta periode jual dan `remaining` per kategori. `remaining` adalah sisa kuota kategori setelah sold/live hold; jumlah fisik kursi tersedia masih harus dihitung dari seat status pada section yang diizinkan. Tampilkan nilai minimum keduanya. Semua pemeriksaan periode jual dan kuota diulang saat reserve.

SeatPicker membaca canvas dinamis dan baris aktual untuk peta serta daftar. Pilihan kursi disesuaikan ketika kategori/availability berubah. Public catalog menampilkan harga minimum kategori aktif. Editor lama tetap dapat mengedit metadata/cover/publikasi, tetapi tidak menimpa konfigurasi kategori fleksibel. `customSeating` menandai event yang konfigurasinya dikelola melalui API baru.

RPC Supabase: `seating_configuration(p_event)`, `configure_event_layout(p_event,p_version,p_layout)`, `configure_ticket_category(p_event,p_category,p_version,p_data)`. Gunakan session client; service-role key tidak dikirim ke browser.

## Verifikasi dan batasnya

Jalankan `npm test`, `npm run typecheck`, `npm run build`.

Tes baru memeriksa denah 60 kursi, baris khusus, rollback invalid/overlap/nomor duplikat, stale version, isolasi event satu venue, RLS attendee/staff/organizer, audit, shared-category seat conflict, multi-seat rollback, kuota, kategori nonaktif, expiry, section lock, harga/nama historis, pembayaran idempotent, dan pembatasan body streaming.

PGlite memakai satu engine. Uji Promise bersamaan menunjukkan invariant dan konflik pada engine lokal; ini tidak menggantikan pengujian koneksi PostgreSQL remote secara paralel. Sebelum produksi, jalankan dua sesi attendee di staging untuk kursi sama, lalu pastikan hanya satu booking berhasil. Uji juga UI editor Orang 3 setelah diintegrasikan dan viewport mobile/tablet/desktop pada denah custom. Belum ada klaim QA visual editor custom, realtime remote, atau load test 2.000 kursi.
