# Email Auth SummaPass melalui Resend

Supabase Auth tetap membuat token verifikasi/reset dan memvalidasi pengguna. Resend SMTP mengirim email dengan template SummaPass. Email ini dikirim langsung oleh Supabase, tidak menunggu worker Schedules. Template HTML di repo tidak otomatis diterapkan ke project hosted.

## 1. Custom SMTP

Buka Supabase Dashboard > Authentication > Email (bagian Notifications) > SMTP Settings. Aktifkan Custom SMTP dan isi:

| Field | Nilai |
| --- | --- |
| Sender email | `tickets@summapass.web.id` |
| Sender name | `SummaPass` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key Resend yang memiliki izin sending untuk domain ini |

Simpan. Password di sini adalah API key Resend, bukan password akun Resend. Masukkan nilainya langsung di dashboard, jangan di file template atau Git. Pengaturan Vercel `RESEND_API_KEY` tidak otomatis mengatur SMTP Supabase.

Di Resend, nonaktifkan click tracking untuk domain pengirim agar URL verifikasi tidak ditulis ulang. Domain harus berstatus Verified untuk pengiriman.

## 2. Template

Masih di Authentication > Email, buka masing-masing template:

| Template Supabase | Subject | HTML Body |
| --- | --- | --- |
| Confirm sign up | `Verifikasi email kamu - SummaPass` | Seluruh isi `supabase/templates/confirm-signup.html` |
| Reset password | `Reset kata sandi - SummaPass` | Seluruh isi `supabase/templates/reset-password.html` |

Deploy route `/auth/confirm` terlebih dahulu, lalu simpan masing-masing template. Template baru memakai `{{ .TokenHash }}` dan tujuan tetap `https://summapass.web.id/auth/confirm`. Server memanggil `verifyOtp` untuk membuat sesi sebelum membuka halaman verifikasi atau reset. Tautan dapat dibuka pada browser lain tanpa cookie PKCE dari browser asal. Pertahankan seluruh baris `$link` dan variabelnya persis seperti file. `{{ .SiteURL }}` hanya digunakan untuk tautan logo. Template ini khusus production; staging perlu hostname staging tersendiri.

## 3. URL

Di Authentication > URL Configuration:

- Site URL: `https://summapass.web.id`
- Redirect URLs: `https://summapass.web.id/auth/callback**` dan `https://summapass.vercel.app/auth/callback**` bila domain Vercel masih dipakai. Suffix `**` mengizinkan query `next` dari aplikasi; gunakan host production yang spesifik.
- Vercel Production: `SUMMAPASS_APP_URL=https://summapass.web.id`.

Site URL wajib URL lengkap dengan `https://`. Nilai seperti `summapass.vercel.app` akan dianggap path relatif dan dapat mengarah ke `PROJECT.supabase.co/summapass.vercel.app`, menghasilkan `requested path is invalid`. Jika URL juga berisi `otp_expired`, minta email baru setelah konfigurasi disimpan. Tautan lama tidak menjadi valid kembali.

## 4. Pengujian nyata

1. Daftar akun uji baru yang kamu kendalikan. Email Confirm sign up harus menggunakan sender SummaPass dan desain baru. Klik verifikasi, lalu pastikan login berhasil. Ulangi pada browser lain dengan akun uji lain.
2. Dari akun lain yang belum verified, uji tombol kirim ulang. Callback harus menuju domain production.
3. Logout, pilih Lupa kata sandi untuk akun uji, buka email Reset password, lalu simpan kata sandi baru. Pastikan kata sandi baru bisa dipakai login. Uji juga browser lain dan tautan yang telah digunakan.
4. Cek Resend Emails untuk status penerimaan provider. Jika gagal, cek Supabase Auth Logs. Jangan menyimpan URL token atau kata sandi pada log/screenshot publik.

Mengganti template/SMTP di dashboard berlaku untuk email baru tanpa redeploy. Perbaikan kode redirect kirim ulang membutuhkan deploy aplikasi. Email yang sudah masuk sebelumnya tidak berubah.

Referensi: [Resend SMTP untuk Supabase](https://resend.com/docs/send-with-supabase-smtp) dan [template Supabase](https://supabase.com/docs/guides/auth/auth-email-templates).
