'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function MobileNavigation({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const closeMenu = () => setOpen(false);
    window.addEventListener('resize', closeMenu);
    setMounted(true);
    return () => window.removeEventListener('resize', closeMenu);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={open ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(current => !current)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {mounted && open && createPortal(
        <div className="mobile-sidebar-overlay" role="presentation" onClick={() => setOpen(false)}>
          <aside
            id="mobile-navigation"
            className="mobile-sidebar"
            aria-label="Navigasi mobile"
            onClick={event => event.stopPropagation()}
          >
            <div className="mobile-sidebar-heading">
              <strong>Menu</strong>
              <button type="button" aria-label="Tutup menu navigasi" onClick={() => setOpen(false)}>
                <X size={22} />
              </button>
            </div>
            <nav>
              <Link href="/events" onClick={() => setOpen(false)}>Daftar event</Link>
              <Link href="/#cara-kerja" onClick={() => setOpen(false)}>Cara pesan</Link>
              {loggedIn ? (
                <Link href="/account" onClick={() => setOpen(false)}>Akun saya</Link>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)}>Masuk / Daftar</Link>
              )}
            </nav>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}