# SummaPass — Design system proposal

Persetujuan pengguna diterima 3 November 2026. Aturan tambahan: jangan gunakan em dash pada copy dan jangan gunakan eyebrow, yaitu label kecil di atas judul section. Judul halaman dan section tampil langsung tanpa preheading.

Revisi visual disetujui untuk dikerjakan sebelum fitur lanjutan: orange #FF681C, hot pink #FF49A8, yellow #FFE044, mint #51E3AB dan purple #6632CF sebagai aksen. Menggantikan warna pastel awal untuk tampilan web. Font Plus Jakarta Sans Variable dimuat lokal melalui paket fontsource, bukan sekadar fallback CSS. Arah visual cut-paper ticket dengan border tegas, offset shadow, poster ilustrasi ekspresif, animasi masuk dan hover. Reduced motion mematikan animasi. Badge kategori berada setelah judul agar tidak menjadi eyebrow.

Konsep: playground event dengan discovery editorial yang hangat, poster besar, judul tegas dan checkout tenang. Wordmark teks SummaPass dengan simbol potongan tiket sederhana akan menjadi usulan awal. Palette merupakan inspirasi Summarecon, bukan spesifikasi resmi.

## Tokens
| Token | Nilai | Pemakaian |
|---|---|---|
| brand | #F47B20 | Identitas, primary button dengan teks charcoal |
| brand-bright | #FF9B42 | Hover/fill dekoratif |
| brand-burnt | #D95B16 | Aksen; bukan otomatis warna teks kecil |
| yellow | #F5C84C | Hold/reserved, teks charcoal |
| pink | #F28C9B | Aksen kategori terpilih |
| mint | #78BFA5 | Available, teks charcoal |
| blue | #7799D4 | Aksen editorial/chart |
| canvas | #FFF9F2 | Background |
| surface-alt | #F4EDE3 | Section tenang |
| ink | #252525 | Teks utama dan focus outline |
| muted | #77716B | Dekoratif/teks besar; teks kecil memakai #625C56 |
| danger | #A52A20 | Error dengan label/icon |

Primary button memakai charcoal di atas orange; link kecil memakai ink dengan underline. Seluruh kombinasi final wajib diuji WCAG AA (4.5:1 teks biasa, 3:1 teks besar dan batas kontrol). Status tidak pernah mengandalkan warna saja.

- Font: Plus Jakarta Sans, fallback sans-serif. Display 48/56 desktop, 32/40 mobile; H1 36/44, H2 28/36, H3 22/30, body 16/24, label 14/20, caption 12/18. Weight 400/500/600/700.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96 px. Container 1200px, gutter mobile 16 / tablet 24 / desktop 32.
- Breakpoints: 640, 768, 1024, 1280px. Satu kolom mobile, sidebar checkout desktop, organizer tabel scroll dengan nama/status utama tetap terlihat.
- Radius: input/button 8px, card 12px, dialog 16px; pill hanya badge/filter. Shadow ringan 0 4px 16px #2525250D; tidak ada glassmorphism.
- Motion: 120ms hover, 180ms panel, 240ms dialog; reduced-motion menonaktifkan animasi gerak. Tidak ada animasi countdown mengganggu.
- Target sentuh minimal 44px, focus outline ink 2px + offset 3px. Error terhubung ke field, ringkasan error dapat difokuskan.

## Komponen
Button primary/secondary/ghost/destructive dengan hover, focus, disabled, loading; input/select/date field dengan label, help dan inline error; badge teks+icon; dialog dengan focus trap/return; toast status melalui live region; event card poster 4:3 dan harga/tanggal; table filter/sort/pagination dan CSV; skeleton berdimensi tetap; empty state dengan tindakan pemulihan; banner offline/demo; countdown dengan label waktu server.

Seat AVAILABLE mint + outline; SELECTED orange + check; RESERVED yellow + lock; SOLD abu + silang; ineligible outline putus-putus + label. Nama aksesibel menyebut section/baris/nomor/harga/status. Navigasi keyboard dan alternatif daftar section/baris; konflik diumumkan live region. Ringkasan mobile sticky tidak menutup konten/focus.

## Komposisi halaman
Homepage: header ringkas → hero orange dengan judul dan pencarian → featured poster editorial → upcoming grid → kategori → cara kerja → FAQ/footer. Detail: poster dan judul, jadwal/lokasi/aturan, panel kategori/harga dan CTA. Checkout: langkah jelas, form dan ringkasan, countdown persisten. Tiket: identitas event, nama/kursi, QR hitam-putih quiet zone minimal 4 modul, target awal 240px dan print 35mm; uji scan nyata menentukan ukuran final. Jangan menutupi QR dengan dekorasi.

Organizer: sidebar netral, event switcher, KPI terdefinisi, chart berlabel dan tabel operasional. Staff: event jelas, scanner besar, fallback manual dan outcome teks tegas; tombol konfirmasi hanya saat VALID. Semua halaman memiliki loading/empty/error/success yang relevan.

Poster awal dibuat lokal untuk event fiktif musik, workshop dan pertunjukan keluarga, diberi label demo. Tidak menggunakan foto acak atau mengklaim aset resmi. Belum ada aset, komponen UI, ataupun hasil pengujian visual; dokumen ini adalah spesifikasi untuk review.


## Bahasa antarmuka
Gunakan bahasa Indonesia yang singkat dan langsung. Judul menjelaskan fungsi halaman, seperti Daftar event, Pilih kursi, Tambah event, Ringkasan, dan Check-in petugas. Hindari slogan puitis, kalimat promosi, dan penjelasan berulang. Pertahankan instruksi penting, batas input, status, serta konfirmasi tindakan. Tanpa em dash dan eyebrow.
