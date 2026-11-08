# Pengelolaan event Orang 3

Implementasi: UI denah/kategori, edit dan impor perubahan peserta, duplikasi acara, pengumuman manual, filter periode pemesanan, serta ekspor peserta/kehadiran.

## Aktivasi

1. Terapkan migrasi 001–016 yang sudah dipakai sebelumnya. Jangan mengulang migrasi lama.
2. Jalankan seluruh supabase/migrations/202611080017_organizer_tools.sql sekali di SQL Editor Supabase, mulai dari BEGIN sampai COMMIT. Uji di staging terlebih dahulu.
3. Periksa dengan node scripts/supabase-check.mjs --seating --organizer-tools. Pemeriksaan ini hanya metadata dan penolakan akses anonim.
4. Login sebagai organizer assigned. Buka Organizer > Event dan kursi > Denah, peserta, dan laporan. Dari editor detail, tombol Pengelolaan event mengarah ke halaman yang sama: /organizer/events/{id}/manage.
5. Deploy aplikasi setelah migrasi tersedia. File ini tidak mengaktifkan migrasi production secara otomatis.

## Cara pakai

- **Denah dan kategori:** edit nama/harga/kuota/periode/section/status kategori. Saat mengubah denah, tambahkan section atau baris dan jumlah kursi, klik kursi untuk mengubah baris/nomor/posisi, atau hapus kursi/baris. Lebar/tinggi menyesuaikan penambahan kursi; ukuran juga dapat diedit. Simpan seluruh denah untuk menerapkan geometri dan kategori secara atomik. Kategori dengan penjualan tetap memakai ID dan snapshot harga historis.
- **Peserta:** cari nama, referensi, atau kursi; edit nama/email/catatan dengan alasan. Hanya pesanan lunas sebelum check-in yang dapat diubah. QR, pemilik pesanan, harga, dan kursi tidak berpindah.
- **Impor CSV:** unduh data peserta yang dapat diedit, pertahankan kolom id,revision,name,email,notes, ubah datanya, unggah, periksa pratinjau, isi alasan, lalu terapkan. Maksimal 500 baris/1 MB. Ini impor perubahan untuk peserta pada booking yang sudah ada, bukan penerbitan tiket baru atau penambahan peserta tanpa pembayaran. Jika ada baris tidak valid, beda event, check-in, atau versi lama, seluruh transaksi dibatalkan.
- **Duplikasi:** pilih jadwal mulai baru (WIB). Salinan berstatus DRAFT, memiliki section/kursi/kategori sendiri, dan periode penjualan digeser mengikuti jadwal. Detail dan cover disalin; transaksi, peserta, tim, dan tiket tidak disalin. Jika Storage gagal, draf tetap tersimpan dengan peringatan untuk unggah cover ulang.
- **Pengumuman:** isi judul/isi, konfirmasi, lalu kirim. Satu notifikasi dan email per akun pemesan confirmed+paid dengan tiket aktif, walaupun akun itu memiliki beberapa booking. Riwayat menampilkan jumlah penerima. Tombol memicu worker pertama; antrean besar/retry dilanjutkan Schedules. Maksimal satu pengumuman per menit dan 10 per acara per 24 jam.
- **Laporan:** tanggal memakai tanggal pemesanan dalam WIB, termasuk tanggal akhir. Dashboard memfilter booking, pendapatan confirmed+paid, dan tiket terjual; ketersediaan kursi dan ringkasan kehadiran tetap live. CSV dashboard memakai filter periode/event/status/pencarian. Pada workspace event, CSV peserta dan kehadiran memakai periode pemesanan tetapi mencakup semua nama, sesuai label UI. CSV kehadiran mencakup peserta lunas, baik sudah hadir maupun belum.

## Perlindungan data

RPC memeriksa auth.uid() dan assignment ORGANIZER, memakai search_path kosong, dan tidak dapat dijalankan anonim. STAFF dan pembeli tidak dapat membaca direktori peserta melalui RPC baru atau mengubah peserta lewat tabel. Edit peserta mengunci event dan memeriksa revision; audit menyimpan alasan, ID peserta, serta versi, tanpa menyalin email ke metadata audit. Pengumuman dan duplikasi memakai UUID idempotensi. Duplikasi dan kegagalan impor tidak menghapus transaksi sumber.

Perubahan nama berlaku pada tampilan tiket/PDF baru. Lampiran email yang sudah terkirim atau payload retry yang sudah difreeze tidak diubah. Gunakan kirim ulang tiket untuk mendapatkan PDF terbaru. Email peserta adalah data administrasi; email tiket tetap milik akun pemesan.

## Verifikasi

- npm test: tes lama serta CSV ber-kutip/multibaris, formula spreadsheet, batas tanggal WIB, akses lintas peran, duplikasi independen/idempotent, rollback impor, konflik revision, peserta sudah check-in, dedup/rate limit pengumuman.
- npm run typecheck dan npm run build.
- TEST_ORIGIN diarahkan ke preview demo terisolasi lalu node tests/organizer-tools-http.mjs: akses API, Origin, input dan penolakan mutasi Supabase pada mode demo.
- Tes PGlite bukan bukti race antar-koneksi Supabase. Uji UI desktop/ponsel, backup sebelum migrasi, clone cover Storage, impor CSV nyata, dan pengiriman pengumuman ke inbox masih perlu dilakukan pada staging. Data QA lokal tidak dikirim ke production.
