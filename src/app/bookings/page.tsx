import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { bookings } from '@/features/booking/service';
import { MyBookingsList } from '@/features/booking/my-bookings-list';

export const metadata = {
  title: 'Reservasi saya',
  robots: { index: false, follow: false }
};

export default async function BookingsPage() {
  const user = await requireSession('/bookings');
  const list = await bookings(user.id);

  return (
    <main id="main" className="container section">
      <div className="page-heading">
        <h1>Reservasi saya</h1>
        <p>Pantau status transaksi, selesaikan pembayaran tertunda, atau tinjau riwayat pesanan Anda.</p>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <h2>Belum ada reservasi</h2>
          <p>Pilih event untuk membuat reservasi kursi Anda di Summarecon Mall Bandung.</p>
          <Link className="button" href="/events">
            Daftar event
          </Link>
        </div>
      ) : (
        <MyBookingsList bookings={list} />
      )}

      <div style={{ marginTop: 24 }}>
        <Link className="text-link back" href="/account">
          Kembali ke akun
        </Link>
      </div>
    </main>
  );
}
