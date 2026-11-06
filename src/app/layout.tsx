import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Ticket } from 'lucide-react';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { getSession } from '@/lib/auth/session';
import { MobileNavigation } from '@/components/mobile-navigation';

export const metadata: Metadata = {
  title: { default: 'SummaPass | Tiket event', template: '%s | SummaPass' },
  description: 'Cari event dan pesan tiket di Summarecon Mall Bandung. Aplikasi demo.'
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="id">
      <body>
        <a href="#main" className="skip-link">Lewati ke konten</a>
        <header className="site-header">
          <div className="container nav">
            <Link href="/" className="wordmark" aria-label="SummaPass beranda">
              <Ticket size={28} strokeWidth={2.3} />Summa<span>Pass</span><b>®</b>
            </Link>
            <nav aria-label="Navigasi utama">
              <Link href="/gallery">Upcoming Event</Link>
              <Link href="/#cara-kerja">Cara pesan</Link>
              {session ? (
                <Link href="/account">Akun saya</Link>
              ) : (
                <Link href="/login">Masuk / Daftar</Link>
              )}
            </nav>
            <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell />
              <Link className="button button-small" href="/events">Cari event <ArrowUpRight size={16} /></Link>
            </div>
              <MobileNavigation loggedIn={Boolean(session)} />
          </div>
        </header>
        <div className="demo-strip">Demo SummaPass. Event dan harga fiktif.</div>
        {children}
        <footer>
          <div className="container footer-top">
            <Link className="wordmark" href="/">Summa<span>Pass</span></Link>
            <Link href="/events">Temukan event <ArrowUpRight size={16} /></Link>
          </div>
          <div className="container footer-bottom">
            <span>© 2026 SummaPass. Prototipe independen.</span>
            <span>Bandung</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
