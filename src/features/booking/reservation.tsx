'use client';
import Link from 'next/link';
import { CopyReference } from '@/components/copy-reference';
import { useCallback, useEffect, useState } from 'react';
import { Clock3, CheckCircle2, CreditCard, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import type { Booking } from './types';

export function Reservation({ initial, serverNow }: { initial: Booking; serverNow: string }) {
  const [data, setData] = useState(initial);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.parse(serverNow));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingSnap, setLoadingSnap] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/bookings/${initial.id}`, { cache: 'no-store' });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setData(next.booking);
      setOffset(Date.parse(next.serverNow) - Date.now());
      setError('');
    } catch {
      setError('Status reservasi belum dapat diperbarui. Coba muat ulang.');
    }
  }, [initial.id]);

  useEffect(() => {
    setOffset(Date.parse(serverNow) - Date.now());
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const polling = setInterval(() => void refresh(), 5000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(timer);
      clearInterval(polling);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [refresh, serverNow]);

  const seconds = Math.max(0, Math.ceil((Date.parse(data.expiresAt) - now - offset) / 1000));
  const active = data.status === 'PENDING_PAYMENT' && seconds > 0;
  const paid = data.status === 'CONFIRMED';
  const failed = data.status === 'FAILED';
  const status = paid
    ? 'Pembayaran berhasil'
    : active
    ? 'Reservasi berhasil'
    : data.status === 'CANCELLED'
    ? 'Reservasi dibatalkan.'
    : failed
    ? 'Pembayaran belum berhasil.'
    : 'Waktu reservasi habis.';

  async function cancel() {
    setBusy(true);
    try {
      const response = await fetch(`/api/bookings/${data.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
      setConfirmCancel(false);
    } catch {
      setError('Pembatalan belum berhasil. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function pay(outcome: 'success' | 'failure') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/bookings/${data.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome })
      });
      const result = await response.json();
      if (!response.ok) {
        await refresh();
        throw new Error(result.error);
      }
      setData(result.booking);
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : 'Konfirmasi belum diterima. Periksa status sebelum mencoba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePayMidtrans() {
    if (loadingSnap || busy || !active) return;
    setLoadingSnap(true);
    setError('');

    try {
      // 1. Ensure Midtrans Snap script is loaded
      if (typeof window !== 'undefined' && !(window as any).snap) {
        await new Promise<void>((resolve, reject) => {
          const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
          const script = document.createElement('script');
          script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
          if (clientKey) script.setAttribute('data-client-key', clientKey);
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Gagal memuat skrip pembayaran Midtrans Snap.'));
          document.body.appendChild(script);
        });
      }

      // 2. Fetch Snap Token from our backend
      const res = await fetch('/api/payments/midtrans/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: data.id })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Gagal memulai sesi Midtrans.');

      // 3. Open Midtrans Snap Popup
      if (typeof window !== 'undefined' && (window as any).snap) {
        (window as any).snap.pay(result.token, {
          onSuccess: async () => {
            // Instant client-side reconciliation
            await pay('success');
          },
          onPending: async () => {
            await refresh();
          },
          onError: async () => {
            setError('Pembayaran gagal atau dibatalkan di Midtrans.');
            await refresh();
          },
          onClose: () => {
            // Modal closed by user
          }
        });
      } else if (result.redirectUrl) {
        window.open(result.redirectUrl, '_blank');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka Midtrans Sandbox.');
    } finally {
      setLoadingSnap(false);
    }
  }

  return (
    <div className="reservation-page">
      <h1 aria-live="polite">{data.eventCancelledAt ? 'Acara dibatalkan' : status}</h1>
      {data.eventCancelledAt && (
        <p role="status">{data.eventCancellationReason} Tiket tidak berlaku. Pembatalan tidak memproses refund.</p>
      )}
      <p>
        {data.eventCancelledAt
          ? 'Riwayat pembayaran tetap tersimpan.'
          : paid
          ? 'Tiket sudah tersedia.'
          : active
          ? 'Selesaikan pembayaran sebelum waktunya habis.'
          : failed
          ? 'Tiket sudah dilepas. Silakan pesan ulang.'
          : 'Tiket sudah dilepas.'}
      </p>

      <section className={`reservation-card ${paid ? 'payment-confirmed' : ''}`}>
        <div className="reservation-timer">
          {paid ? <CheckCircle2 size={28} /> : <Clock3 size={26} />}
          <div>
            <span>{paid ? 'Pembayaran' : active ? 'Sisa waktu reservasi' : 'Status reservasi'}</span>
            <strong aria-label={active ? `${Math.floor(seconds / 60)} menit ${seconds % 60} detik tersisa` : status}>
              {paid
                ? 'Lunas'
                : active
                ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
                : data.status === 'CANCELLED'
                ? 'Dibatalkan'
                : failed
                ? 'Gagal'
                : 'Kedaluwarsa'}
            </strong>
          </div>
        </div>

        <div className="booking-reference reference-with-copy"><span>Referensi {data.reference}</span><CopyReference value={data.reference}/></div>
        <h2>
          {data.categoryName} · {data.items.length} tiket
        </h2>

        <ul className="reservation-items">
          {data.items.map(item => (
            <li key={item.seatId}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.name}</span>
              </div>
              <span>{rupiah(item.price)}</span>
            </li>
          ))}
        </ul>

        {data.discountAmount && data.discountAmount > 0 ? (
          <div style={{ display: 'grid', gap: 6, margin: '14px 0', padding: '10px 12px', background: 'var(--cream)', border: '1.5px solid var(--ink)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}>
              <span>Harga Asli</span>
              <span style={{ textDecoration: 'line-through' }}>{rupiah(data.originalTotal ?? data.total + data.discountAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red, #e11d48)', fontWeight: 700, fontSize: 13 }}>
              <span>Potongan Promo {data.promoName ? `(${data.promoName})` : ''}</span>
              <span>- {rupiah(data.discountAmount)}</span>
            </div>
          </div>
        ) : null}

        <div className="reservation-total">
          <strong>Total Bayar</strong>
          <strong>{rupiah(data.total)}</strong>
        </div>

        <p className="reservation-notice">Pembayaran simulasi Sandbox Midtrans. Tidak ada tagihan nyata.</p>

        {active && (
          <div className="payment-simulator" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h3 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                <CreditCard size={22} /> Pembayaran Midtrans Sandbox
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                Mendukung QRIS (GoPay/ShopeePay/BCA), Virtual Account, dan E-Wallet.
              </p>
            </div>

            {/* Primary Midtrans Action */}
            <button
              className="button"
              type="button"
              style={{
                background: '#002B49',
                color: '#ffffff',
                borderColor: '#002B49',
                fontWeight: 800,
                fontSize: 15,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                borderRadius: 8
              }}
              disabled={busy || loadingSnap || !active}
              onClick={() => void handlePayMidtrans()}
            >
              <ShieldCheck size={20} color="#00e599" />
              {loadingSnap ? 'Menghubungkan Midtrans...' : 'Bayar via Midtrans Sandbox'}
              <ArrowUpRight size={18} />
            </button>

            <div
              style={{
                fontSize: 12,
                color: 'var(--ink)',
                background: 'var(--cream)',
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px dashed var(--ink)',
                lineHeight: 1.5
              }}
            >
              <strong>Tips Pengujian:</strong> Setelah popup Midtrans muncul, gunakan{' '}
              <a
                href="https://simulator.sandbox.midtrans.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--purple)', textDecoration: 'underline', fontWeight: 700 }}
              >
                Simulator Midtrans ↗
              </a>{' '}
              untuk simulasi bayar QRIS / VA secara instan.
            </div>

            {/* Secondary Quick 1-Click Simulation */}
            <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="button button-light payment-success-button"
                style={{ flex: 1, fontSize: 12, padding: '8px 12px' }}
                disabled={busy || loadingSnap || !active}
                onClick={() => void pay('success')}
                title="Bypass instan tanpa membuka popup Midtrans"
              >
                {busy ? 'Memproses...' : 'Simulasi Instan (1-Klik)'}
              </button>
              <button
                type="button"
                className="payment-failure-button"
                style={{ fontSize: 12, padding: '8px 12px' }}
                disabled={busy || loadingSnap || !active}
                onClick={() => void pay('failure')}
              >
                Simulasi Gagal
              </button>
            </div>
          </div>
        )}

        {paid && (
          <div className="payment-ticket-link">
            <Link className="button" href="/my-tickets">
              Lihat tiket
              <ArrowUpRight size={18} />
            </Link>
          </div>
        )}

        {active &&
          (confirmCancel ? (
            <div className="cancel-confirm">
              <p>Batalkan seluruh tiket dalam reservasi ini?</p>
              <button className="button" disabled={busy} onClick={cancel}>
                {busy ? 'Membatalkan...' : 'Ya, batalkan reservasi'}
              </button>
              <button className="text-link" onClick={() => setConfirmCancel(false)} disabled={busy}>
                Tetap simpan
              </button>
            </div>
          ) : (
            <button
              className="text-link cancel-reservation-button"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Batalkan reservasi
            </button>
          ))}

        {error && (
          <div role="alert" className="form-error">
            {error}
            <button data-icon-action="" title="Perbarui status pembayaran" aria-label="Perbarui status pembayaran" className="text-link" onClick={() => void refresh()}>
              <RefreshCw size={20} aria-hidden="true"/>
            </button>
          </div>
        )}
      </section>

      {!data.eventCancelledAt && (
        <Link className="text-link" href={`/events/${data.slug}/${data.items.every(i=>i.label==='Tanpa nomor kursi')?'tickets':'seats'}`} >
          {paid ? 'Pesan tiket lainnya' : 'Pesan tiket lagi'}
        </Link>
      )}
      <Link className="text-link" href="/bookings">
        Semua reservasi
      </Link>
    </div>
  );
}
