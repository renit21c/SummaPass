'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Check, ArrowUpRight, Ticket, AlertCircle, Info, Calendar, LogIn } from 'lucide-react';
import { useNotifications } from './store';

export function NotificationBell({ loggedIn }: { loggedIn: boolean }) {
  const { items, unreadCount, loading, error, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const recent = items.slice(0, 4);

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
        aria-expanded={open}
        style={{
          background: open ? 'var(--yellow)' : 'transparent',
          border: '1.5px solid var(--ink)',
          borderRadius: 8,
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          position: 'relative',
          color: 'var(--ink)',
          boxShadow: open ? '2px 2px 0 var(--ink)' : 'none'
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              background: 'var(--danger)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'grid',
              placeItems: 'center',
              border: '1.5px solid var(--ink)'
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Panel Notifikasi"
          className="notification-panel"
          style={{
            position: 'absolute',
            top: 52,
            right: 0,
            width: 360,
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--cream)',
            border: '2px solid var(--ink)',
            borderRadius: 14,
            boxShadow: '6px 7px 0 var(--ink)',
            zIndex: 1000,
            overflow: 'hidden'
          }}
        >
          {!loggedIn ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: 12, border: '1.5px solid var(--ink)', background: 'var(--yellow)', display: 'grid', placeItems: 'center' }}>
                <Bell size={22} />
              </div>
              <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>Login untuk melihat notifikasi</strong>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Masuk ke akun terlebih dahulu agar notifikasi pemesanan dan tiket dapat ditampilkan.</p>
              <Link href="/login" onClick={() => setOpen(false)} className="button button-small">
                <LogIn size={16} /> Login sekarang
              </Link>
            </div>
          ) : (
            <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--line)', background: 'var(--yellow)' }}>
            <div>
              <strong style={{ fontSize: 15, display: 'block' }}>Notifikasi</strong>
              <span style={{ fontSize: 11, color: 'var(--ink)' }}>{unreadCount} pesan baru</span>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{ background: 'none', border: 0, fontSize: 11, fontWeight: 700, color: 'var(--purple)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Check size={14} /> Tandai dibaca
              </button>
            )}
          </div>

          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {loading ? <p role="status">Memuat notifikasi...</p> : error ? <p role="alert">{error}</p> : recent.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 24, fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                Belum ada notifikasi.
              </p>
            ) : (
              recent.map(item => {
                const Icon = item.type === 'ticket' ? Ticket : item.type === 'reminder' ? Calendar : item.type === 'booking' ? AlertCircle : Info;
                return (
                  <div
                    key={item.id}
                    onClick={() => markAsRead(item.id)}
                    style={{
                      padding: 14,
                      borderBottom: '1px solid var(--line)',
                      background: item.read ? 'transparent' : 'var(--purple-light)',
                      display: 'flex',
                      gap: 12,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ flexShrink: 0, marginTop: 2, color: 'var(--purple)' }}>
                      <Icon size={18} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <strong style={{ fontSize: 13, display: 'block', overflowWrap: 'anywhere' }}>{item.title}</strong>
                        {!item.read && (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--purple)', flexShrink: 0 }} />
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--ink)', margin: '4px 0 6px', lineHeight: 1.4 }}>
                        {item.message}
                      </p>
                      {item.link && (
                        <Link
                          href={item.link}
                          onClick={() => setOpen(false)}
                          style={{ fontSize: 11, fontWeight: 700, color: 'var(--purple)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          Buka detail <ArrowUpRight size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ padding: '12px 18px', background: 'var(--surface)', borderTop: '1px solid var(--line)', textAlign: 'center' }}>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-link"
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              Lihat semua notifikasi ({items.length}) <ArrowUpRight size={14} />
            </Link>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
