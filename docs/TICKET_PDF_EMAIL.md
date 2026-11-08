# E-ticket PDF dan lampiran email

Generator PDF yang sama dipakai unduhan `/api/tickets/{id}/pdf` dan email TICKET_READY/TICKET_RESEND. PDF A4 memakai warna dan border SummaPass, font Plus Jakarta Sans tertanam, detail acara, nama peserta, kategori, kursi, harga historis, referensi serta QR opaque asli. Tidak ada lagi pola QR ilustrasi pada PDF. Data event berasal dari snapshot tiket, sehingga tiket event unpublished/archived tidak diganti data seed demo.

## Perilaku

- Setelah pembayaran terkonfirmasi: satu email membawa satu PDF berisi seluruh tiket ACTIVE dalam booking tersebut, maksimal6halaman/6kursi. Satu halaman untuk satu peserta.
- Kirim ulang dari satu tiket: satu PDF untuk tiket yang dipilih, bukan seluruh tiket milik akun.
- Pengingat dan pemberitahuan perubahan event tetap memakai tautan, tanpa lampiran tiket tambahan.
- Tombol Unduh PDF tersedia di halaman tiket. Cetak memakai A4 pada skala100%; QR vector memiliki quiet zone4modul dan tetap hitam di atas putih.
- PDF dengan status tiket dicabut ditandai DICABUT dan tidak menampilkan QR aktif. Worker tidak mengirim tiket REVOKED.
- Email memakai header oranye dan tombol ungu, serta pemberitahuan PDF terlampir.

PDF memang dapat dibuka dan dicetak langsung tanpa login. Lampiran memuat QR yang bisa dipakai untuk check-in; perubahan ini memenuhi permintaan pengguna untuk mengirim tiket siap cetak. Tautan halaman tiket tetap memerlukan login. Server scanner tetap memeriksa status tiket dan pemakaian QR, sehingga PDF lama tidak dapat membuat tiket dicabut atau sudah dipakai menjadi valid lagi.

## Migrasi dan aktivasi

1. Terapkan seluruh isi `supabase/migrations/202611060012_ticket_pdf_email.sql` setelah011. Jangan mengulang011yang sudah berhasil. Tidak ada key baru; tetap gunakan SUMMAPASS_TICKET_KEY_V1 yang sudah dipakai mengenkripsi token tiket.
2. Restart server agar dependency PDFKit, font dan konfigurasi server terbaru dimuat.
3. Jalankan `node scripts/supabase-check.mjs --notifications`; hasil terbaru mencakup Lampiran PDF email.
4. Buat booking baru dan bayar simulasi, atau gunakan Email e-ticket PDF pada tiket milik akun untuk membuat job baru.
5. Jalankan worker seperti sebelumnya. Untuk pengujian dengan onboarding@resend.dev, alamat penerima harus sama dengan alamat akun Resend. Tidak ada pengiriman nyata yang otomatis dilakukan oleh migrasi, build atau preview PDF.
6. Buka lampiran PDF di inbox uji, periksa halaman per tiket dan lakukan scan dengan perangkat fisik sebelum rilis.

Worker memeriksa konfigurasi migrasi012 sebelum claim job, sehingga migrasi yang belum diterapkan menghasilkan MIGRATION_REQUIRED tanpa menghabiskan attempt email. Job lama yang sudah memiliki payload tetap memakai payload lama secara persis untuk menjaga idempotency; file PDF tidak ditambahkan diam-diam ke request yang pernah dicoba. Gunakan permintaan kirim ulang baru jika ingin lampiran untuk tiket yang sebelumnya hanya dikirim sebagai tautan. Job FAILED tidak otomatis dikirim ulang.

## Keamanan dan retry

RPC `notification_attachment_tickets(job,lease)` hanya service_role. Record dibatasi pada pemilik dan booking dari job, serta tiket tertentu bila resend. PDF builder mengulang validasi owner/booking/status, memastikan token hasil decrypt cocok dengan hash, dan menggunakan snapshot event/harga/kategori. Tidak ada akses Storage publik untuk PDF email.

Email baru beserta konten PDF disimpan sebagai envelope versi2 terenkripsi AES-256-GCM. Kunci delivery diturunkan dengan HKDF dari kunci tiket, dengan purpose yang terpisah dari token tiket. Daftar UUID tiket menjadi authenticated associated data. QR dan konten lampiran tidak disimpan terbuka dalam JSON outbox. Envelope yang sudah difreeze dibuka kembali saat retry, sehingga payload, filename dan file PDF tetap sama untuk Idempotency-Key yang sama.

Batas satu lampiranPDF sebesar1MB sebelum base64, maksimal6tiket. Ukuran JSON outbox dibatasi3MB untuk envelope terenkripsi. Lease worker, max5attempt dan jendela23jam tetap berlaku. Context worker memeriksa setiap ticketId dari bundle yang sudah disimpan sebelum mengirim. Bila salah satu tiket kemudian dicabut, bundle dilewati dengan ATTACHED_TICKET_INACTIVE; tidak dibuat ulang dengan isi berbeda pada key yang sama. Penerima yang berubah juga menyebabkan job dilewati. Request resend baru dapat digunakan untuk tiket lain yang masih aktif.

## Validasi

Tes memeriksa kepemilikan, booking scope, status aktif, event snapshot, hash/token, multi-page, nama file aman, PDF header/embedded font, serta enkripsi dan payload retry yang sama. Uji PostgreSQL memastikan RPC tidak dapat dipanggil attendee/staff dan bundle yang dibatalkan tidak dikirim. Uji render memakai Poppler dan jsQR untuk membaca token dari halaman PDF yang benar-benar dirender, serta pdftotext untuk teks Unicode. Tes render dilewati bila Poppler tidak tersedia di mesin lain; tes struktur/kriptografi tetap berjalan.

Preview fiktif dapat dibuat ulang dengan `npx tsx scripts/preview-ticket-pdf.ts` dan tersimpan di output/pdf/summapass-e-ticket-preview.pdf. Poppler menghasilkan PNG untuk pemeriksaan visual. Preview tidak berasal dari transaksi nyata dan tidak berlaku untuk masuk event. Font dilisensikan SIL OFL dari package @fontsource/plus-jakarta-sans; PDFKit dieksekusi sebagai package server dan dua file font disertakan dalam output tracing Next.js.

## Tampilan email, 8 November 2026

Template notifikasi memakai header oranye, panel pesan kuning, tombol ungu, aksen mint/pink dan footer copyright SummaPass dengan tahun WIB. Email tiket memiliki panel PDF terlampir dan instruksi cetak A4; email lainnya tidak menampilkan informasi lampiran. Teks tombol mengikuti tujuan tiket, booking atau undangan. HTML memakai tabel presentasi dan inline CSS, dengan fallback Arial/Helvetica jika Plus Jakarta Sans tidak tersedia. Versi teks juga menyertakan copyright.

Template baru berlaku saat payload email pertama kali dibuat. Payload yang sudah dibekukan di outbox tidak diubah ketika retry agar idempotensi provider tetap terjaga. Restart aplikasi/worker dan buat permintaan kirim ulang baru untuk mencoba desain terbaru. Tidak perlu SQL baru. Preview browser desktop/390px diperiksa, 11 tes notifikasi/PDF dan typecheck lulus; belum merupakan verifikasi rendering di setiap aplikasi email. Tidak ada email sungguhan dikirim saat QA ini.
