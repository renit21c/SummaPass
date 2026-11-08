import Link from 'next/link';
import { Ticket as TicketIcon } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { tickets } from '@/features/booking/service';
import { MyTicketsList } from '@/features/tickets/my-tickets-list';

export const metadata = {
  title: 'Tiket saya',
  robots: { index: false, follow: false }
};

export default async function MyTickets({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const user = await requireSession('/my-tickets');
  const { booking } = await searchParams;

  let list;
  try {
    list = await tickets(user.id, booking);
  } catch {
    return (
      <main id="main" className="container section empty-state">
        <h1>Tiket gagal dimuat.</h1>
        <p>Muat ulang atau hubungi penyelenggara.</p>
        <Link className="button" href="/my-tickets">Coba lagi</Link>
      </main>
    );
  }

  return (
    <main id="main" className="container section">
      <div className="page-heading">
        <h1>Tiket saya</h1>
        <p>Tiket muncul setelah pembayaran berhasil. Tunjukkan kode QR e-ticket kepada petugas saat check-in.</p>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <TicketIcon size={40} />
          <h2>Belum ada tiket</h2>
          <p>Selesaikan pembayaran untuk mendapatkan tiket.</p>
          <Link className="button" href="/bookings">Lihat reservasi</Link>
        </div>
      ) : (
        <MyTicketsList tickets={list} />
      )}

      <div style={{ marginTop: 32, display: 'flex', gap: 20, alignItems: 'center' }}>
        <Link href="/bookings" className="text-link back">Semua reservasi</Link>
        {booking && (
          <Link href="/my-tickets" className="text-link">Semua tiket saya</Link>
        )}
      </div>
    </main>
  );
}
