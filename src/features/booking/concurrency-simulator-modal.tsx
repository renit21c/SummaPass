'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, LoaderCircle, UserRound, X, Zap } from 'lucide-react';
import type { ConcurrencySimulationResult } from './concurrency';
import { simulationInitialCategoryId, simulationSalesState } from './simulation-availability';
import './concurrency-simulator.css';

type SeatItem = { id: string; section: string; row: string; number: number; status: string };
type CategoryItem = { id: string; name: string; sections: string[]; salesStart?: string; salesEnd?: string };
export function ConcurrencySimulatorModal({ isOpen, onClose, slug, categories, seats, serverNow, activeCategoryId, selectedSeatId, onSimulationComplete }: {
  isOpen: boolean; onClose: () => void; slug: string; categories: CategoryItem[]; seats: SeatItem[];
  serverNow: string; activeCategoryId?: string; selectedSeatId?: string; onSimulationComplete?: () => void;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [seatId, setSeatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConcurrencySimulationResult | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const opened = useRef(false);
  const running = useRef(false);
  const id = useId();
  useEffect(() => {
    if (isOpen && !opened.current) {
      setCategoryId(simulationInitialCategoryId(categories, activeCategoryId, serverNow));
      setSeatId(selectedSeatId ?? '');
      setResult(null); setError('');
    }
    opened.current = isOpen;
  }, [isOpen, activeCategoryId, selectedSeatId, categories, serverNow]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.showModal();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [isOpen]);
  const category = categories.find(c => c.id === categoryId) ?? categories[0];
  const salesOpen = !!category && simulationSalesState(category, serverNow) === 'OPEN';
  const available = seats.filter(s => salesOpen && s.status === 'AVAILABLE' && category?.sections.includes(s.section));
  const seat = available.find(s => s.id === seatId) ?? available[0];
  async function run() {
    if (running.current || !seat || !category) return;
    running.current = true; setLoading(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/bookings/simulate-concurrency', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, categoryId: category.id, seatId: seat.id, autoRelease: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Simulasi gagal. Coba lagi.');
      setResult(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Simulasi gagal. Coba lagi.'); }
    finally { running.current = false; setLoading(false); onSimulationComplete?.(); }
  }
  if (!isOpen) return null;
  const passed = result?.outcome === 'PASSED';
  return createPortal(<dialog ref={dialog} className="war-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={e => { e.preventDefault(); if (!running.current) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !running.current) onClose(); }}>
    <div className="war-content" aria-busy={loading}>
      <header className="war-heading">
        <div><h2 id={`${id}-title`}>Simulasi war tiket</h2><p id={`${id}-description`}>2 pembeli memesan kursi yang sama.</p></div>
        <button className="war-close" type="button" disabled={loading} onClick={onClose} aria-label="Tutup simulasi"><X size={20}/></button>
      </header>
      {!result ? <>
        <div className="war-fields">
          <label>Kategori<select value={category?.id ?? ''} disabled={loading} onChange={e => { setCategoryId(e.target.value); setSeatId(''); setError(''); }}>
            {categories.map(c => { const state = simulationSalesState(c, serverNow); return <option key={c.id} value={c.id} disabled={state !== 'OPEN'}>{c.name}{state === 'CLOSED' ? ' (Ditutup)' : state === 'UPCOMING' ? ' (Belum dibuka)' : ''}</option>; })}
          </select></label>
          <label>Kursi<select value={seat?.id ?? ''} disabled={loading || !available.length} onChange={e => { setSeatId(e.target.value); setError(''); }}>
            {!available.length && <option value="">Tidak ada kursi tersedia</option>}
            {available.map(s => <option key={s.id} value={s.id}>{s.section} {s.row}{s.number}</option>)}
          </select></label>
        </div>
        <p className="war-note">{salesOpen ? 'Reservasi uji otomatis dibatalkan setelah selesai.' : 'Tidak ada kategori dengan penjualan terbuka.'}</p>
        {error && <p className="war-error" role="alert"><AlertTriangle size={18}/>{error}</p>}
        <button className="button war-run" type="button" onClick={run} disabled={loading || !seat}>
          {loading ? <LoaderCircle size={18} className="spin"/> : <Zap size={18}/>}{loading ? 'Menguji pemesanan...' : 'Mulai simulasi'}
        </button>
        {loading && <p className="war-note" role="status">Menunggu hasil kedua pembeli.</p>}
      </> : <>
        <div className={`war-outcome ${passed ? 'is-passed' : ''}`} role="status">
          {passed ? <CheckCircle2 size={24}/> : <AlertTriangle size={24}/>}
          <div><h3>{passed ? '1 berhasil, 1 ditolak' : result.outcome === 'DOUBLE_BOOKING' ? 'Pemesanan ganda terdeteksi' : 'Uji belum berhasil'}</h3>
            <p>{passed ? `Kursi ${result.seatLabel} hanya dipesan satu kali.` : 'Lihat hasil percobaan di bawah.'}</p></div>
        </div>
        <div className="war-buyers">{[result.buyerA, result.buyerB].map(b => <article key={b.buyerName}>
          <div><UserRound size={18}/><strong>{b.buyerName}</strong></div>
          <span className={`war-status ${b.status === 'WINNER' ? 'is-winner' : ''}`}>{b.status === 'WINNER' ? 'Berhasil' : b.status === 'REJECTED' ? 'Ditolak' : 'Gagal'}</span>
          <p>{b.message}</p>
        </article>)}</div>
        <p className={result.cleanupError ? 'war-error' : 'war-note'} role={result.cleanupError ? 'alert' : undefined}>
          {result.cleanupError || (result.autoReleased ? 'Kursi sudah tersedia kembali.' : 'Tidak ada reservasi yang dilepas.')}
        </p>
        {result.participantCount > 1 && <p className="war-note">Paket ini memakai {result.participantCount} kursi per pembeli.</p>}
        <details className="war-details"><summary>Detail uji</summary><p>Selesai dalam {result.totalDurationMs} ms.</p>
          {[result.buyerA, result.buyerB].map(b => <p key={b.buyerName}>{b.buyerName}: HTTP {b.httpStatus}{b.error ? ` (${b.error})` : ''}{b.bookingReference ? ` · ${b.bookingReference}` : ''}</p>)}
        </details>
        <div className="war-actions"><button className="button button-light" type="button" onClick={() => { setResult(null); setError(''); }} disabled={!!result.cleanupError}>Ulangi</button><button className="button" type="button" onClick={onClose}>Selesai</button></div>
      </>}
    </div>
  </dialog>, document.body);
}
