'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Zap,
  X,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  RefreshCw,
  UserCheck,
  UserX,
  Lock,
  ArrowRight
} from 'lucide-react';
import type { ConcurrencySimulationResult } from './concurrency';

interface SeatItem {
  id: string;
  section: string;
  row: string;
  number: number;
  status: string;
}

interface CategoryItem {
  id: string;
  name: string;
  sections: string[];
}

export function ConcurrencySimulatorModal({
  isOpen,
  onClose,
  slug,
  categories,
  seats,
  activeCategoryId,
  selectedSeatId,
  onSimulationComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  categories: CategoryItem[];
  seats: SeatItem[];
  activeCategoryId?: string;
  selectedSeatId?: string;
  onSimulationComplete?: () => void;
}) {
  const availableSeats = seats.filter(s => s.status === 'AVAILABLE');

  const [seatId, setSeatId] = useState('');
  const [autoRelease, setAutoRelease] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConcurrencySimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    // Only initialize/reset when the modal is freshly opened from closed state
    if (isOpen && !prevOpenRef.current) {
      const activeCat = categories.find(c => c.id === activeCategoryId);
      const seatsInActiveCat = activeCat
        ? availableSeats.filter(s => activeCat.sections.includes(s.section))
        : availableSeats;

      const preferred =
        (selectedSeatId && availableSeats.find(s => s.id === selectedSeatId)?.id) ||
        seatsInActiveCat[0]?.id ||
        availableSeats[0]?.id ||
        '';

      setSeatId(preferred);
      setResult(null);
      setError(null);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, selectedSeatId, activeCategoryId, categories, availableSeats]);

  if (!isOpen) return null;

  const currentSeat = seats.find(s => s.id === seatId);
  const currentCategory =
    categories.find(c => currentSeat && c.sections.includes(currentSeat.section)) ||
    categories[0];

  async function handleRunSimulation() {
    if (!seatId || !currentCategory) {
      setError('Silakan pilih kursi yang tersedia terlebih dahulu.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/bookings/simulate-concurrency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          categoryId: currentCategory.id,
          seatId,
          seatLabel: currentSeat ? `${currentSeat.section} ${currentSeat.row}${currentSeat.number}` : undefined,
          autoRelease,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Simulasi gagal dijalankan.');
      }

      setResult(data);
      if (onSimulationComplete) {
        onSimulationComplete();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan sistem saat simulasi.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="concurrency-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="concurrency-modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="concurrency-modal-header">
          <div className="concurrency-modal-title-wrap">
            <span className="concurrency-tag">
              <Zap size={14} className="concurrency-tag-icon" />
              <span>HIGH CONCURRENCY LAB</span>
            </span>
            <h2>Simulasi "War Tiket" (Anti-Race Condition)</h2>
            <p className="concurrency-subtitle">
              Demonstrasi interaktif pembuktian ketahanan database PostgreSQL saat dua pembeli memesan kursi yang sama di milidetik yang serentak.
            </p>
          </div>
          <button
            type="button"
            className="concurrency-modal-close"
            onClick={onClose}
            aria-label="Tutup modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="concurrency-modal-body">
          {/* Controls Bar */}
          {!result && (
            <div className="concurrency-setup-box">
              <div className="concurrency-setup-row">
                <div className="concurrency-field">
                  <label htmlFor="sim-seat-select">Kursi yang Diperebutkan:</label>
                  <select
                    id="sim-seat-select"
                    value={seatId}
                    onChange={e => setSeatId(e.target.value)}
                    disabled={loading}
                    className="concurrency-select"
                  >
                    {availableSeats.length === 0 ? (
                      <option value="">Semua kursi sudah terisi</option>
                    ) : (
                      categories.map(cat => {
                        const catSeats = availableSeats.filter(s => cat.sections.includes(s.section));
                        if (!catSeats.length) return null;
                        return (
                          <optgroup key={cat.id} label={`Kategori ${cat.name} (${catSeats.length} kursi tersedia)`}>
                            {catSeats.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.section} — Baris {s.row}, Kursi #{s.number}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })
                    )}
                  </select>
                </div>

                <div className="concurrency-field">
                  <label>Kategori Tiket:</label>
                  <div
                    className="concurrency-readonly-badge"
                    style={{
                      borderColor: currentCategory?.name.toLowerCase().includes('vip') || currentCategory?.name.toLowerCase().includes('front') ? 'var(--purple)' : 'var(--ink)',
                      color: currentCategory?.name.toLowerCase().includes('vip') || currentCategory?.name.toLowerCase().includes('front') ? 'var(--purple)' : 'var(--ink)',
                      fontWeight: 800,
                    }}
                  >
                    {currentCategory ? currentCategory.name : '-'}
                  </div>
                </div>
              </div>

              {/* Scenario Explanation */}
              <div className="concurrency-scenario-note">
                <strong>Skenario Simulasi:</strong>
                <p>
                  Sistem akan menembakkan dua request reservasi serentak (<code>Promise.all</code>) untuk kursi ini:
                  <br />
                  <strong>Pembeli A (Budi Prasetyo)</strong> dan <strong>Pembeli B (Siti Rahma)</strong>.
                </p>
              </div>

              {/* Options */}
              <label className="concurrency-checkbox-label">
                <input
                  type="checkbox"
                  checked={autoRelease}
                  onChange={e => setAutoRelease(e.target.checked)}
                  disabled={loading}
                />
                <span>
                  <strong>Lepas reservasi otomatis setelah simulasi</strong> (kursi langsung di-reset kembali berstatus <code>AVAILABLE</code> di denah venue SMB).
                </span>
              </label>

              {error && (
                <div className="concurrency-error-banner">
                  <AlertTriangle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                className="concurrency-run-btn"
                onClick={handleRunSimulation}
                disabled={loading || availableSeats.length === 0}
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Mengeksekusi Concurrent Request & Row-Lock...</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Mulai Simulasi War Tiket (Simultaneous Request)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Result State */}
          {result && (
            <div className="concurrency-result-container">
              {/* Outcome Banner */}
              <div className="concurrency-outcome-banner">
                <ShieldCheck size={28} className="outcome-banner-icon" />
                <div>
                  <h3>INTEGRITAS DATABASE 100% TERJAGA</h3>
                  <p>
                    Tepat <strong>1 transaksi lolos ({result.winnerCount})</strong> dan <strong>1 transaksi ditolak secara aman ({result.rejectedCount})</strong>. Nol kursi ganda (Double-booking = 0).
                  </p>
                </div>
              </div>

              {/* Split Cards: Buyer A vs Buyer B */}
              <div className="concurrency-split-grid">
                {/* Buyer A */}
                <div className={`buyer-result-card ${result.buyerA.status === 'WINNER' ? 'is-winner' : 'is-rejected'}`}>
                  <div className="buyer-card-header">
                    <div className="buyer-identity">
                      {result.buyerA.status === 'WINNER' ? <UserCheck size={20} /> : <UserX size={20} />}
                      <div>
                        <h4>{result.buyerA.buyerName}</h4>
                        <span className="buyer-email">{result.buyerA.email}</span>
                      </div>
                    </div>
                    <span className={`status-pill ${result.buyerA.status === 'WINNER' ? 'pill-winner' : 'pill-rejected'}`}>
                      {result.buyerA.status === 'WINNER' ? 'PEMENANG LOCK' : 'DITOLAK AMAN'}
                    </span>
                  </div>

                  <div className="buyer-card-body">
                    <div className="metric-row">
                      <span>Waktu Request:</span>
                      <code>T + {result.buyerA.timestampOffsetMs} ms</code>
                    </div>
                    <div className="metric-row">
                      <span>HTTP Status:</span>
                      <strong>{result.buyerA.httpStatus} {result.buyerA.status === 'WINNER' ? 'Created' : 'Conflict'}</strong>
                    </div>
                    {result.buyerA.bookingReference && (
                      <div className="metric-row">
                        <span>Kode Booking:</span>
                        <code className="booking-ref-badge">{result.buyerA.bookingReference}</code>
                      </div>
                    )}
                    <div className="buyer-message-box">
                      <p>{result.buyerA.message}</p>
                    </div>
                  </div>
                </div>

                {/* Buyer B */}
                <div className={`buyer-result-card ${result.buyerB.status === 'WINNER' ? 'is-winner' : 'is-rejected'}`}>
                  <div className="buyer-card-header">
                    <div className="buyer-identity">
                      {result.buyerB.status === 'WINNER' ? <UserCheck size={20} /> : <UserX size={20} />}
                      <div>
                        <h4>{result.buyerB.buyerName}</h4>
                        <span className="buyer-email">{result.buyerB.email}</span>
                      </div>
                    </div>
                    <span className={`status-pill ${result.buyerB.status === 'WINNER' ? 'pill-winner' : 'pill-rejected'}`}>
                      {result.buyerB.status === 'WINNER' ? 'PEMENANG LOCK' : 'DITOLAK AMAN'}
                    </span>
                  </div>

                  <div className="buyer-card-body">
                    <div className="metric-row">
                      <span>Waktu Request:</span>
                      <code>T + {result.buyerB.timestampOffsetMs} ms</code>
                    </div>
                    <div className="metric-row">
                      <span>HTTP Status:</span>
                      <strong>{result.buyerB.httpStatus} {result.buyerB.status === 'WINNER' ? 'Created' : 'Conflict'}</strong>
                    </div>
                    {result.buyerB.bookingReference && (
                      <div className="metric-row">
                        <span>Kode Booking:</span>
                        <code className="booking-ref-badge">{result.buyerB.bookingReference}</code>
                      </div>
                    )}
                    <div className="buyer-message-box">
                      <p>{result.buyerB.message}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Audit Box */}
              <div className="concurrency-audit-box">
                <div className="audit-box-header">
                  <Lock size={16} />
                  <span>BUKTI ARSITEKTUR TEKNIS (TECHNICAL PROOF)</span>
                </div>
                <ul className="audit-list">
                  <li>
                    <strong>PostgreSQL Row-Locking:</strong> <code>SELECT ... FOR UPDATE</code> mengeksekusi penguncian baris secara berurutan dan mengisolasi transaksi.
                  </li>
                  <li>
                    <strong>Partial Unique Index:</strong> <code>one_active_seat</code> menjamin secara deterministik tidak dapat ada dua alokasi <code>RESERVED</code> atau <code>SOLD</code> untuk kursi yang sama.
                  </li>
                  <li>
                    <strong>Waktu Total Eksekusi:</strong> <code>{result.totalDurationMs} ms</code> di lingkungan database real-time.
                  </li>
                  <li>
                    <strong>Status Kursi {result.seatLabel}:</strong>{' '}
                    {result.autoReleased ? (
                      <span className="text-success font-bold">Telah dilepas kembali (AVAILABLE) untuk demo berikutnya.</span>
                    ) : (
                      <span className="text-warning font-bold">Sedang ditahan (RESERVED) dengan timer 10 menit.</span>
                    )}
                  </li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="concurrency-result-actions">
                <button type="button" className="concurrency-secondary-btn" onClick={handleReset}>
                  Uji Kursi Lainnya
                </button>
                <button type="button" className="concurrency-primary-btn" onClick={onClose}>
                  Tutup & Kembali ke Denah Venue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

