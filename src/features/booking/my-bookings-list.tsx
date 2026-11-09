'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Ticket as TicketIcon
} from 'lucide-react';
import type { Booking } from './types';
import { events, rupiah } from '@/features/events/data';

export function MyBookingsList({ bookings }: { bookings: Booking[] }) {
  const [tab, setTab] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');

  const confirmedCount = bookings.filter(b => b.status === 'CONFIRMED').length;
  const pendingCount = bookings.filter(b => b.status === 'PENDING_PAYMENT').length;
  const cancelledCount = bookings.filter(
    b => b.status === 'CANCELLED' || b.status === 'EXPIRED' || b.status === 'FAILED' || Boolean(b.eventCancelledAt)
  ).length;

  const filtered = bookings.filter(b => {
    if (tab === 'confirmed') return b.status === 'CONFIRMED';
    if (tab === 'pending') return b.status === 'PENDING_PAYMENT';
    if (tab === 'cancelled') {
      return (
        b.status === 'CANCELLED' ||
        b.status === 'EXPIRED' ||
        b.status === 'FAILED' ||
        Boolean(b.eventCancelledAt)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Quick filter tabs */}
      <div className="my-tickets-tabs" role="tablist" aria-label="Filter status reservasi">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`my-tickets-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          Semua ({bookings.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'confirmed'}
          className={`my-tickets-tab ${tab === 'confirmed' ? 'active' : ''}`}
          onClick={() => setTab('confirmed')}
        >
          ✓ Dikonfirmasi ({confirmedCount})
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pending'}
            className={`my-tickets-tab ${tab === 'pending' ? 'active' : ''}`}
            onClick={() => setTab('pending')}
          >
            ⏳ Menunggu Bayar ({pendingCount})
          </button>
        )}
        {cancelledCount > 0 && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'cancelled'}
            className={`my-tickets-tab ${tab === 'cancelled' ? 'active' : ''}`}
            onClick={() => setTab('cancelled')}
          >
            ✕ Dibatalkan ({cancelledCount})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div
          className="empty-state"
          style={{
            padding: '40px 20px',
            border: '1.5px dashed var(--ink)',
            borderRadius: 12,
            background: 'var(--cream)'
          }}
        >
          <TicketIcon size={36} />
          <h3>Tidak ada reservasi pada kategori ini</h3>
          <p>Silakan pilih tab filter lainnya untuk melihat riwayat reservasi Anda.</p>
        </div>
      ) : (
        <div
          className="bookings-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 20,
            marginBottom: 36
          }}
        >
          {filtered.map(b => {
            const event = events.find(e => e.slug === b.slug);
            const title = b.eventTitle ?? event?.title ?? b.slug;
            const isConfirmed = b.status === 'CONFIRMED';
            const isPending = b.status === 'PENDING_PAYMENT';
            const isCancelled = b.status === 'CANCELLED';
            const isExpired = b.status === 'EXPIRED';
            const isFailed = b.status === 'FAILED';
            const isEventCancelled = Boolean(b.eventCancelledAt);

            const seatSummary = b.items.map(i => i.label || i.seatId).join(', ');

            return (
              <Link
                key={b.id}
                href={`/bookings/${b.id}`}
                className="booking-card-item"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '20px 22px',
                  border: '2px solid var(--ink)',
                  borderRadius: 14,
                  background: isConfirmed ? '#ffffff' : isPending ? '#fffdf7' : '#faf9f8',
                  boxShadow: '4px 5px 0 var(--ink)',
                  opacity: isCancelled || isExpired || isFailed ? 0.9 : 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  minHeight: 200,
                  overflow: 'hidden'
                }}
              >
                {/* Header: Reference and Status Badge */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 12,
                      minWidth: 0
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: 'var(--muted)',
                        letterSpacing: '0.5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        maxWidth: '55%'
                      }}
                      title={b.reference}
                    >
                      {b.reference}
                    </span>

                    {/* Status badge pill */}
                    {isEventCancelled ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: '#fff0ed',
                          border: '1.5px solid #d92d20',
                          color: '#d92d20',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <AlertTriangle size={13} />
                        <span>Acara Batal</span>
                      </div>
                    ) : isConfirmed ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: '#ecfdf3',
                          border: '1.5px solid #12b76a',
                          color: '#027a48',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <CheckCircle2 size={13} />
                        <span>Dikonfirmasi</span>
                      </div>
                    ) : isPending ? (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: '#fff9eb',
                          border: '1.5px solid #f79009',
                          color: '#b54708',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <Clock size={13} />
                        <span>Menunggu Bayar</span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: '#fff0ed',
                          border: '1.5px solid #d92d20',
                          color: '#d92d20',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <XCircle size={13} />
                        <span>{isExpired ? 'Waktu Habis' : isFailed ? 'Gagal' : 'Dibatalkan'}</span>
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      margin: '0 0 6px',
                      color: 'var(--ink)',
                      lineHeight: 1.3
                    }}
                  >
                    {title}
                  </h2>

                  {/* Category & Seats */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--muted)',
                      marginTop: 4
                    }}
                  >
                    <TicketIcon size={15} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.categoryName} · {b.items.length} kursi ({seatSummary})
                    </span>
                  </div>
                </div>

                {/* Footer: Total & Action link */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    paddingTop: 16,
                    borderTop: '1px dashed #e2e8f0',
                    marginTop: 16
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        display: 'block',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: 2
                      }}
                    >
                      Total Tagihan
                    </span>
                    <strong
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: isConfirmed ? 'var(--ink)' : isPending ? '#b54708' : 'var(--muted)'
                      }}
                    >
                      {rupiah(b.total)}
                    </strong>
                  </div>

                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 800,
                      color: isPending ? 'var(--orange)' : 'var(--purple)'
                    }}
                  >
                    <span>{isPending ? 'Selesaikan Bayar' : 'Detail'}</span>
                    <ArrowUpRight size={15} />
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

