# Masuk dengan Google

Tombol Google tersedia pada Masuk dan Daftar ketika `SUMMAPASS_AUTH_MODE=supabase`. Akun baru dibuat oleh Supabase Auth; peran organizer/petugas tetap ditentukan oleh `event_access`, bukan akun Google atau parameter browser. Tidak ada SQL migration, dependency, atau environment variable baru.

## 1. Buat Google OAuth client

1. Buka Google Cloud Console, pilih atau buat project SummaPass.
2. Di Google Auth Platform, isi Branding (nama SummaPass, email dukungan, kontak), lalu Audience. Pilih External jika digunakan pengguna umum. Jika masih Testing, tambahkan akun Google penguji pada Test users.
3. Gunakan scope dasar OpenID, email, dan profile saja.
4. Pada Clients, buat OAuth client dengan tipe Web application.
5. Authorized JavaScript origins: `https://summapass.web.id`. Untuk lokal tambahkan `http://localhost:3000` dan `http://127.0.0.1:3000` sesuai alamat yang dipakai. Port harus sesuai.
6. Authorized redirect URI: salin Callback URL dari provider Google di Supabase. Bentuknya `https://<PROJECT_REF>.supabase.co/auth/v1/callback`. Ini bukan callback website SummaPass.
7. Simpan Client ID dan Client Secret. Jangan masukkan Client Secret ke source code atau variabel `NEXT_PUBLIC_*`.

## 2. Aktifkan pada Supabase

1. Authentication > Sign In / Providers > Google.
2. Enable Google, isi Client ID dan Client Secret dari Google Cloud, lalu Save.
3. Authentication > URL Configuration: Site URL `https://summapass.web.id`.
4. Tambahkan Redirect URLs:

```text
https://summapass.web.id/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

Jika memakai domain Vercel lain atau port lokal lain, tambahkan callback pada host/port itu. Pakai host yang sama sepanjang alur agar cookie PKCE tersedia. Tombol mempertahankan origin tempat pengguna memulai login, walaupun `SUMMAPASS_APP_URL` lokal berisi domain produksi.

## 3. Uji

1. Jalankan aplikasi atau deploy kode terbaru.
2. Buka Masuk > Lanjutkan dengan Google, lalu pilih akun.
3. Pembeli kembali ke halaman tujuan atau Akun Saya; organizer ke `/organizer`, petugas ke `/staff`. Undangan petugas yang spesifik tetap dibuka setelah login.
4. Uji pembatalan pada Google, akun baru, dan akun Google yang sudah ditugaskan role. Google email harus cocok dengan akun yang memang ditugaskan. Login Google tidak otomatis memberi role.
5. Verifikasi bahwa lupa kata sandi dan verifikasi email masih menuju halaman semula.

Untuk publik, ubah Audience dari Testing ke In production sesuai persyaratan Google. Pada Testing, hanya akun penguji yang diizinkan. Pengaturan ini tidak dapat diselesaikan dari kode aplikasi saja.

## Implementasi

POST `/api/auth/google` memeriksa same-origin, menerapkan rate limit login, dan membuat URL OAuth menggunakan Supabase SSR. Cookie PKCE ditulis sebelum native browser navigation ke provider. GET `/auth/callback` menukar authorization code menjadi session, memeriksa session melalui server, dan memakai role database untuk tujuan Google. Error provider dan token tidak ditampilkan atau dicatat.

Tombol memakai native form, sehingga tidak bergantung pada fetch lintas origin atau popup. Client ID/Secret disimpan pada provider Supabase, bukan Vercel. Tidak ada permintaan akses Google Drive, Gmail, atau token refresh Google tambahan.

Referensi: https://supabase.com/docs/guides/auth/social-sign-in/auth-google
