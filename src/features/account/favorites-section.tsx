'use client';
import Link from 'next/link';
import { Heart, ArrowUpRight, CalendarDays, Ticket } from 'lucide-react';
import { useFavorites } from '@/features/events/favorites';
import { events, dateLabel, rupiah, type Event } from '@/features/events/data';

export function FavoritesSection({ catalog }: { catalog: Event[] }) {
  const { favorites, toggle } = useFavorites();
  const allEvents = catalog.length ? catalog : events;
  const favoriteEvents = allEvents.filter(e => favorites.includes(e.slug));

  return (
    <section className="profile-favorites" aria-labelledby="profile-favorites-title">
      <div className="profile-favorites-heading">
        <div>
          <Heart size={22} aria-hidden="true"/>
          <h2 id="profile-favorites-title">Event favorit</h2>
          <span className="profile-favorites-count">{favoriteEvents.length}</span>
        </div>
        <Link href="/events" className="button button-small button-dark">
          Cari event
          <ArrowUpRight size={16} />
        </Link>
      </div>

      {favoriteEvents.length === 0 ? (
        <div className="profile-favorites-empty">
          <p>Belum ada favorit. Klik ikon hati pada event untuk menyimpannya di sini.</p>
          <Link href="/events" className="button button-small">
            Cari Event Sekarang
          </Link>
        </div>
      ) : (
        <div className="favorites-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {favoriteEvents.map(event => (
            <div
              key={event.slug}
              style={{
                background: 'var(--cream)',
                border: '1.5px solid var(--ink)',
                borderRadius: 10,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '3px 3px 0 var(--ink)'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--purple-light)', color: 'var(--purple)', padding: '3px 8px', borderRadius: 4 }}>
                    {event.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(event.slug)}
                    data-icon-action="" title={`Hapus ${event.title} dari favorit`} aria-label={`Hapus ${event.title} dari favorit`}
                    style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: 'var(--danger)' }}
                  >
                    <Heart size={18} fill="currentColor" />
                  </button>
                </div>

                <h3 style={{ fontSize: 18, margin: '0 0 8px', fontWeight: 800 }}>
                  {event.title}
                </h3>

                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
                  <CalendarDays size={14} />
                  {dateLabel(event.date)}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
                <div>
                  <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>Mulai dari</span>
                  <strong style={{ fontSize: 14, color: 'var(--purple)' }}>{rupiah(event.price)}</strong>
                </div>
                <Link href={`/events/${event.slug}`} className="button button-small" style={{ minHeight: 36, padding: '6px 12px', fontSize: 12 }}>
                  Lihat Tiket
                  <Ticket size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
