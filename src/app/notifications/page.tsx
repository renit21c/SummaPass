'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, Check, Trash2, ArrowUpRight, Ticket, Calendar, Info, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNotifications } from '@/features/notifications/store';

export default function NotificationsPage() {
  const { items, unreadCount, markAsRead, markAllAsRead, clearNotifications } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const displayed = filter === 'unread' ? items.filter(i => !i.read) : items;

  return (
    <main id="main" className="container section">
      <Link className="text-link back" href="/account">
        <ArrowLeft size={17} /> Kembali ke akun
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 42, margin: 0, fontWeight: 850 }}>Pusat Notifikasi</h1>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14 }}>
            Semua pemberitahuan pemesanan, tiket, pengingat acara, dan pengumuman venue.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <button
              type="button"
              className="button button-small"
              onClick={markAllAsRead}
            >
              <Check size={16} /> Tandai Semua Dibaca
            </button>
          )}

          {items.length > 0 && (
            <button
              type="button"
              className="button button-small button-light"
              onClick={clearNotifications}
            >
              <Trash2 size={16} /> Bersihkan
            </button>
          )}
        </div>
      </div>

      <div className="filter-row" style={{ margin: '0 0 24px' }}>
        <button
          className={`chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Semua ({items.length})
        </button>
        <button
          className={`chip ${filter === 'unread' ? 'active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Belum Dibaca ({unreadCount})
        </button>
      </div>

      {displayed.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--cream)', border: '2px dashed var(--ink)', borderRadius: 16, padding: '60px 20px' }}>
          <Bell size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px' }} />
          <h2>Tidak Ada Notifikasi</h2>
          <p>
            {filter === 'unread'
              ? 'Semua notifikasi telah Anda baca.'
              : 'Anda belum memiliki pemberitahuan baru saat ini.'}
          </p>
          <Link href="/events" className="button">
            Cari Acara Menarik
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {displayed.map(item => {
            const Icon = item.type === 'ticket' ? Ticket : item.type === 'reminder' ? Calendar : item.type === 'booking' ? AlertCircle : Info;

            return (
              <div
                key={item.id}
                onClick={() => markAsRead(item.id)}
                style={{
                  background: item.read ? 'var(--cream)' : 'var(--purple-light)',
                  border: '1.5px solid var(--ink)',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '3px 4px 0 var(--ink)',
                  display: 'flex',
                  gap: 18,
                  alignItems: 'start',
                  cursor: 'pointer',
                  transition: 'transform 0.15s'
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: item.read ? '#fff' : 'var(--purple)',
                    color: item.read ? 'var(--purple)' : '#fff',
                    border: '1.5px solid var(--ink)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0
                  }}
                >
                  <Icon size={22} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 16, fontWeight: 800 }}>{item.title}</strong>
                      {!item.read && (
                        <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--purple)', color: '#fff', padding: '2px 8px', borderRadius: 12 }}>
                          Baru
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {new Date(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.6 }}>
                    {item.message}
                  </p>

                  {item.link && (
                    <Link
                      href={item.link}
                      className="text-link"
                      style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      Buka rincian terkait <ArrowUpRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

