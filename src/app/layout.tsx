import type { Metadata,Viewport } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Ticket, User } from 'lucide-react';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';
import '@/components/ux-enhancements.css';
import '@/features/organizer/workspace.css';
import '@/components/customer-readability.css';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { getSession } from '@/lib/auth/session';
import { MobileNavigation } from '@/components/mobile-navigation';
import { Subo } from '@/features/subo/subo';
import { PwaInstall } from '@/components/pwa-install';
import { ConfirmationProvider } from '@/components/confirmation-dialog';
import { AnchorScrollHandler } from '@/components/anchor-scroll';

export const metadata: Metadata = {
  applicationName:'SummaPass',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,title:'SummaPass',statusBarStyle:'default'},
  icons:{
    icon:[{url:'/favicon.ico',sizes:'any'},{url:'/icon.svg',sizes:'any',type:'image/svg+xml'}],
    shortcut:'/favicon.ico',
    apple:[{url:'/pwa/apple-touch-icon.png',sizes:'180x180',type:'image/png'}]
  },
  title: { default: 'SummaPass | Tiket event', template: '%s | SummaPass' },
  description: 'Cari event dan pesan tiket di Summarecon Mall Bandung. Aplikasi demo.'
};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#ff681c'};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="id">
      <body>
        <ConfirmationProvider>
        <a href="#main" className="skip-link">Lewati ke konten</a>
        <header className="site-header">
          <div className="container nav">
            <Link href="/" className="wordmark" aria-label="SummaPass beranda">
              <Ticket size={28} strokeWidth={2.3} />Summa<span>Pass</span><b>®</b>
            </Link>
            <nav aria-label="Navigasi utama">
              <Link href="/events">Cari event</Link>
              {session && <><Link href="/bookings">Pesanan saya</Link><Link href="/my-tickets">Tiket saya</Link></>}
              <Link href="/#cara-kerja">Cara pesan</Link>
            </nav>
            <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell loggedIn={Boolean(session)} />
              <Link className="button button-small" href={session ? '/account' : '/login'}>
                {session ? (
                  <>
                    Akun saya <User size={18} />
                  </>
                ) : (
                  <>
                    Masuk/Daftar <ArrowUpRight size={18} />
                  </>
                )}
              </Link>
            </div>
              <MobileNavigation loggedIn={Boolean(session)} />
          </div>
        </header>
        {children}
        <AnchorScrollHandler />
        <Subo />
        <footer>
          <div className="container footer-top">
            <Link className="wordmark" href="/">Summa<span>Pass</span></Link>
            <Link href="/events">Temukan event <ArrowUpRight size={16} /></Link>
            <PwaInstall/>
          </div>
          <div className="container footer-bottom">
            <span>© 2026 SummaPass. Prototipe independen.</span>
            <span>Bandung</span>
          </div>
        </footer>
        </ConfirmationProvider>
      </body>
    </html>
  );
}
