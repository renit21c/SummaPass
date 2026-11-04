# Dashboard organizer: monitoring dan laporan

Tahap ini menyediakan ringkasan pendapatan confirmed/paid (tanpa pending/failed), inventori available/reserved/sold, event assigned, booking, peserta, transaksi, pencarian, filter status/event, sort total, pagination dan detail baris. Recharts menampilkan pendapatan per event dan daftar angka aksesibel. Kehadiran tidak dipalsukan: check-in belum tersedia.

Demo organizer dipilih secara eksplisit melalui login atau halaman akun. Server menetapkan role demo dan tiga assignment tetap: Senja di Summa, Clay & Coffee Club, Little Weekend. After Hours tidak ditugaskan dan tidak boleh masuk laporan/CSV. Pengunjung biasa tetap ditolak. Pilihan demoRole diabaikan pada mode Supabase; role produksi hanya event_access terverifikasi.

Data dashboard berasal dari demo store bersama server, bukan angka dekoratif. Kursi sold fixture dua per event ditandai jelas; revenue hanya payment yang benar-benar disimulasikan paid. Snapshot diperbarui dengan tombol refresh; belum ada auto-refresh dashboard. Revenue berdasarkan semua catatan pada event filter, bukan filter nama/status tabel. Inventori semua event assigned tetap masuk hitungan meskipun event disembunyikan. RPC inventori memberi pengecualian hanya kepada organizer assigned; pengunjung tetap hanya dapat melihat event published.

CSV endpoint memeriksa sesi/role dan assignment lagi, mengikuti event/query/status filter, mengabaikan pagination, hanya kolom perlu dan melindungi formula spreadsheet (=,+,-,@ termasuk whitespace prefix). Tidak ada QR token, ciphertext, email atau user ID dalam CSV. Header private/no-store. Kolom harga adalah per kursi, bukan mengulang total booking.

Supabase memerlukan migrasi004 setelah003. RPC organizer_snapshot memakai auth.uid dan hanya assignment ORGANIZER. Tidak memakai service-role key untuk laporan. Mode Supabase belum diuji pada layanan remote; migrasi dan role boundaries diuji pada PGlite.

Belum termasuk dalam tahap monitoring ini: create/edit/publish/archive event, perubahan harga/kuota/section, audit administratif, filter rentang tanggal dan scanner. Tidak ada tombol edit palsu. Pengelolaan tersebut menjadi tahap berikutnya dengan lock event yang sama seperti booking/payment agar sold/hold terlindungi.
