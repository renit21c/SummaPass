'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Ticket as TicketIcon, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import type { Ticket } from './types';
import { events, dateLabel } from '@/features/events/data';

export function MyTicketsList({ tickets }: { tickets: Ticket[] }) {
  const [tab, setTab] = useState<'all' | 'active' | 'revoked'>('all');

  const activeCount = tickets.filter(t => t.status === 'ACTIVE').length;
  const revokedCount = tickets.filter(t => t.status === 'REVOKED').length;

  const filteredTickets = tickets.filter(t => {
    if (tab === 'active') return t.status === 'ACTIVE';
    if (tab === 'revoked') return t.status === 'REVOKED';
    return true;
  });

  return (
    <div>
      {/* Quick filter tabs */}
      <div className="my-tickets-tabs" role="tablist" aria-label="Filter status tiket">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`my-tickets-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          Semua Tiket ({tickets.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'active'}
          className={`my-tickets-tab ${tab === 'active' ? 'active' : ''}`}
          onClick={() => setTab('active')}
        >
          ✓ Aktif ({activeCount})
        </button>
        {revokedCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'revoked'}
            className={`my-tickets-tab ${tab === 'revoked' ? 'active' : ''}`}
            onClick={() => setTab('revoked')}
          >
            ✕ Dibatalkan ({revokedCount})
          </button>
        )}
      </div>

      {filteredTickets.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 20px', border: '1.5px dashed var(--ink)', borderRadius: 12, background: 'var(--cream)' }}>
          <TicketIcon size={36} />
          <h3>Tidak ada tiket pada kategori ini</h3>
          <p>Silakan pilih tab filter lainnya untuk melihat tiket Anda.</p>
        </div>
      ) : (
        <div className="my-ticket-grid">
          {filteredTickets.map(t => {
            const event = t.event ?? events.find(e => e.slug === t.slug);
            const isRevoked = t.status === 'REVOKED';

            return (
              <Link
                href={`/my-tickets/${t.id}`}
                className={`my-ticket-card ${isRevoked ? 'is-revoked' : ''}`}
                style={{ display: 'flex', flexDirection: 'column' }}
                key={t.id}
                aria-label={`Tiket ${event?.title ?? t.slug}, Kursi ${t.seatLabel}, Status ${isRevoked ? 'Dibatalkan' : 'Aktif'}`}
              >
                {/* Header card art */}
                <div
                  className={`ticket-card-art ${isRevoked ? 'is-revoked' : (event?.theme ?? 'sunset')}`}
                  aria-hidden="true"
                >
                  <TicketIcon size={52} />
                  <ArrowUpRight size={27} />
                </div>

                {/* Card copy */}
                <div className="my-ticket-copy" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h2>{event?.title ?? t.slug}</h2>
                  <p>{event ? dateLabel(event.date) : ''}</p>

                  <div className="my-ticket-person">
                    <strong>{t.attendeeName}</strong>
                    <span>{t.seatLabel}</span>
                  </div>

                  {/* Status badge with clear contrast */}
                  <div style={{ marginBottom: 20 }}>
                    {isRevoked ? (
                      <div className="ticket-badge-revoked" style={{ margin: 0 }}>
                        <XCircle size={14} aria-hidden="true" />
                        <span>Dibatalkan / Refunded</span>
                      </div>
                    ) : t.previousAttendeeName ? (
                      <div className="ticket-badge-transferred" style={{ margin: 0 }} title={`Dialihkan dari ${t.previousAttendeeName}`}>
                        <UserCheck size={14} aria-hidden="true" />
                        <span>Dialihkan ke {t.attendeeName}</span>
                      </div>
                    ) : (
                      <div className="ticket-badge-active" style={{ margin: 0 }}>
                        <CheckCircle2 size={14} aria-hidden="true" />
                        <span>Aktif · Siap Digunakan</span>
                      </div>
                    )}
                  </div>

                  {/* Action Link pinned at bottom */}
                  <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                    {isRevoked ? (
                      <span className="text-link" style={{ color: 'var(--muted)', fontSize: 13, display: 'inline-flex' }}>
                        Lihat detail pembatalan
                        <ArrowUpRight size={16} />
                      </span>
                    ) : (
                      <span className="text-link" style={{ fontSize: 13, display: 'inline-flex' }}>
                        Buka QR e-ticket
                        <ArrowUpRight size={16} />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

