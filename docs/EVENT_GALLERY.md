# Galeri per acara

## Aktivasi Supabase

1. Setelah migrasi 024, jalankan seluruh isi `supabase/migrations/202611110025_event_gallery.sql` satu kali di SQL Editor Supabase.
2. Jalankan `npm run supabase:check -- --gallery`. Ini hanya memeriksa metadata, bucket, dan penolakan akses anonim.
3. Restart server lokal atau deploy kode terbaru. Tidak ada environment variable tambahan.

## Cara menggunakan

- Organizer membuka Edit event > Galeri acara, atau Kelola event > Galeri acara.
- Event baru harus disimpan sebagai draf sebelum foto dapat diunggah.
- Pilih beberapa foto sekaligus. Maksimal 10 foto per event, masing-masing 3 MB, format JPG/PNG/WebP, minimal 400 × 250 piksel dan maksimal 24 MP. Foto animasi ditolak.
- File diunggah satu per satu agar ukuran request tetap kecil. Jika salah satu gagal, foto yang sebelumnya berhasil tetap tersimpan.
- Isi keterangan opsional (maksimal 160 karakter), lalu tekan ikon simpan. Hapus foto memakai dialog konfirmasi SummaPass.
- Foto tampil di bawah cover utama di detail acara. Klik foto untuk membuka tampilan besar; tombol arah, keyboard kiri/kanan, dan Escape tersedia.
- Preview pada Upcoming Events juga memuat galeri di bawah cover. Memilih thumbnail mengganti foto utama dalam preview.
- Jika galeri kosong, pembeli tidak melihat ilustrasi atau foto pengganti. Jika layanan galeri gagal, detail acara tetap tersedia dengan pesan singkat.

## Penyimpanan dan akses

`event_gallery_images` menyimpan event, object path, caption, urutan, dan waktu unggah. Maksimal 10 metadata foto dipastikan di bawah lock baris event, sehingga upload bersamaan tidak melewati batas. Semua perubahan dicatat di `audit_logs`.

Bucket `event-gallery` bersifat privat. Server memeriksa isi gambar melalui Sharp, mengubahnya menjadi WebP maksimal 1600 piksel, dan membuang metadata. Browser menerima file melalui `/api/gallery/[file]` menggunakan sesi pemanggil, tanpa service-role bypass.

RLS hanya mengizinkan organizer acara terkait menambah, mengubah, atau menghapus foto. Petugas tidak dapat melihat galeri draf atau mengubah foto. Pengunjung hanya dapat membaca foto yang sudah tertaut ke acara publik. Foto yang belum tertaut tidak terbuka kepada pengunjung. Draft, unpublished, archived, serta event dibatalkan tidak mengekspos fotonya ke publik.

Penghapusan melepas metadata dahulu, sehingga foto langsung tidak tersedia kepada publik, lalu menghapus objek melalui Storage API. Jika pembersihan Storage gagal, organizer mendapat peringatan; objek tersebut tetap privat dan tidak tertaut. Sertakan bucket `event-gallery` dalam backup Storage bersama `event-covers`.

Mode demo memakai `.data/gallery.json` dan `.data/gallery/`, terpisah dari cover. File tetap lokal dan diabaikan Git.

## Pengujian

`npx tsx --test tests/event-gallery.test.ts` memeriksa batas file/path dan menjalankan PostgreSQL lokal melalui PGlite untuk role/event scope, privasi draf, kebutuhan objek unggahan, kuota, caption, unlink, dan kebijakan Storage. Pengujian ini tidak menggantikan uji upload/download ke Storage Supabase yang sesungguhnya setelah migrasi remote.
