# Pembayaran simulasi dan QR e-ticket

## Pengalaman yang tersedia
Dari detail reservasi, pilih simulasi pembayaran berhasil atau gagal. Tidak ada pembayaran nyata dan tidak ada form kartu/rekening/dompet digital. Berhasil sebelum expiry: payment PAID, booking CONFIRMED, kursi SOLD dan satu tiket per kursi dalam operasi atomik. Gagal: booking/payment FAILED, kursi dilepas dan tidak ada tiket. Reservasi expired/cancelled/failed tidak boleh dibayar; buat reservasi baru. Retry setelah PAID mengembalikan hasil existing, termasuk jika request berikutnya meminta failure. Booking confirmed tidak bisa dibatalkan melalui pembatalan hold biasa.

Tiket Saya menampilkan tiket milik sesi login. Halaman tiket memuat jadwal, venue, peserta, kategori/kursi, QR dan referensi unik. Cetak / simpan PDF memakai dialog cetak browser, bukan file PDF server. Tampilan print menggunakan QR 55mm dengan quiet zone 4 modul. Check-in dan status pemakaian tiket belum tersedia pada tahap ini; tiket menampilkan keterbatasan tersebut secara jelas.

## Token dan penyimpanan
Token 32 byte node:crypto randomBytes, diwakili 64 hex. QR hanya memuat token opaque tersebut. Tidak ada nama, email, event atau seat di payload. SHA-256 disimpan untuk verifikasi tahap check-in; token mentah dienkripsi AES-256-GCM dengan nonce random 12 byte dan auth tag 16 byte. Ciphertext dipisah di ticket_secrets, tidak diberi grant/RLS read untuk browser. Owner menerima raw token melalui halaman/API tiket yang memerlukan sesi, Cache-Control private/no-store dan Referrer-Policy no-referrer. Jangan menaruh token/kunci dalam log atau URL.

## Supabase
Terapkan migrasi 001, 002 dan 003 secara berurutan, kemudian seed. Migrasi003 membuat payments/tickets/ticket_secrets, backfill payment untuk booking lama, trigger pending/terminal payment, guard ticket-only-after-paid, dan RPC khusus server. Grant browser hanya select dengan RLS pemilik/organizer assigned; tidak ada penulisan client.

Tambahkan server-only SUPABASE_SERVICE_ROLE_KEY dan SUMMAPASS_TICKET_KEY_V1 (64 hex acak yang disimpan di secret manager). Publishable key tetap dipakai untuk login/reservasi biasa. Service-role hanya dipakai penerbitan/read ciphertext tiket, setelah server memverifikasi getUser dan ownership. Browser tidak dapat memanggil process_simulated_payment atau issued_tickets_for_owner. Jangan memakai prefix NEXT_PUBLIC pada kedua secret tersebut.

Kunci v1 harus stabil selama tiket masih digunakan. Mengganti kunci tanpa migrasi re-encryption akan membuat tiket lama tidak dapat ditampilkan. Jangan commit kunci, menaruhnya pada README, atau mencetaknya pada terminal/log. Setup tahap ini tidak membuat atau mengubah proyek Supabase remote.

process_simulated_payment mengunci event lalu booking, memakai clock_timestamp setelah lock, memeriksa expiry/ownership/alokasi dan total authoritative, lalu memproses payment/booking/seat/ticket/secrets dalam transaksi yang sama. Unique booking payment, booking_item ticket dan token hash mencegah duplikasi. Trigger menolak issuance tanpa paid/confirmed/SOLD. Token bundle dibuat server dan tidak pernah diambil dari body browser. Realtime inventory memakai revision setelah commit. Pemanggilan SQL error menggulung balik seluruh transaksi.

## Demo
Demo memakai private store dan encryption key ephemeral di satu proses Node, bukan Supabase atau payment gateway. Restart menghapus akun demo, booking, payment, tiket dan kunci demo. Critical section pembayaran tidak memakai await sehingga konfirmasi pada satu proses diserialisasi. Ini tidak memberi jaminan lintas instance. Refund, transfer tiket dan pembatalan paid di luar scope tahap ini.

## Verifikasi
npm test mencakup retry/concurrent demo, failure/cancel/expiry/reassignment, privacy, AES-GCM tamper/wrong key, QR encode-rasterize-decode 240px dan migrasi/RLS/RPC PostgreSQL WASM. tests/payments-http.mjs menguji pembayaran/tiket melalui server lokal. PGlite bukan bukti row locking dua koneksi PostgreSQL asli. Koneksi/Realtime Supabase remote, scan perangkat fisik dan hasil printer/PDF nyata perlu pemeriksaan terpisah.
