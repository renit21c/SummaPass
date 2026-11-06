'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  ScanLine,
  RefreshCw,
  UserCheck,
  Users,
  Clock,
  Search,
  RotateCcw,
  FileText,
  History,
  X,
  CheckCircle2,
} from 'lucide-react';
import { outcomeLabels, type CheckInResult, type StaffReport } from './core';

export function CheckInScanner({ events }: { events: { slug: string; title: string }[] }) {
  const [slug, setSlug] = useState(events[0]?.slug ?? '');
  const [credential, setCredential] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Tab & Koreksi states
  const [activeTab, setActiveTab] = useState<'history' | 'audit'>('history');
  const [correctingTicket, setCorrectingTicket] = useState<{
    ticketId: string;
    reference: string;
    attendeeName: string;
    seatLabel?: string;
  } | null>(null);
  const [correctPreset, setCorrectPreset] = useState('Salah scan tiket');
  const [correctNote, setCorrectNote] = useState('');
  const [correctBusy, setCorrectBusy] = useState(false);
  const [correctSuccessMessage, setCorrectSuccessMessage] = useState('');
  const [correctErrorMessage, setCorrectErrorMessage] = useState('');

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  function stop() {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera(false);
  }

  useEffect(() => () => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach(t => t.stop());
  }, []);

  async function fetchReport(targetSlug = slug) {
    if (!targetSlug) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`/api/staff/history?slug=${encodeURIComponent(targetSlug)}`);
      if (r.ok) {
        const data = await r.json();
        setReport(data);
      }
    } catch {
      // Fallback gracefully on network error
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (slug) {
      void fetchReport(slug);
    }
  }, [slug]);

  async function inspect(value: string, confirm = false) {
    stop();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch('/api/staff/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, credential: value, confirm }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setResult(data);
      if (confirm && data.status === 'CHECKED_IN') {
        void fetchReport(slug);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Koneksi terputus. Periksa ulang tiket sebelum mencoba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevert() {
    if (!correctingTicket || !slug) return;
    const finalReason =
      correctPreset === 'Lainnya'
        ? correctNote.trim()
        : correctNote.trim()
          ? `${correctPreset}: ${correctNote.trim()}`
          : correctPreset;

    if (!finalReason || finalReason.length < 3) {
      setCorrectErrorMessage('Alasan koreksi minimal 3 karakter.');
      return;
    }

    setCorrectBusy(true);
    setCorrectErrorMessage('');
    try {
      const r = await fetch('/api/staff/check-in/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          ticketId: correctingTicket.ticketId,
          reason: finalReason,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Gagal membatalkan check-in.');

      setCorrectSuccessMessage(
        `Check-in untuk ${correctingTicket.attendeeName} (${correctingTicket.reference}) berhasil dibatalkan.`
      );
      setCorrectingTicket(null);
      setCorrectNote('');
      setCorrectPreset('Salah scan tiket');

      if (result?.ticket?.id === correctingTicket.ticketId) {
        setResult(null);
      }

      await fetchReport(slug);

      setTimeout(() => {
        setCorrectSuccessMessage('');
      }, 5000);
    } catch (e) {
      setCorrectErrorMessage(e instanceof Error ? e.message : 'Terjadi kesalahan sistem.');
    } finally {
      setCorrectBusy(false);
    }
  }

  async function start() {
    stop();
    setResult(null);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Kamera tidak tersedia di browser ini. Gunakan nomor tiket di bawah.');
      return;
    }
    const run = generation.current;
    setCamera(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (run !== generation.current) {
        media.getTracks().forEach(t => t.stop());
        return;
      }
      stream.current = media;
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      const { default: decode } = await import('jsqr');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw Error('Canvas unavailable');
      function frame() {
        if (run !== generation.current) return;
        const v = video.current;
        if (v && v.readyState >= 2) {
          const scale = Math.min(1, 800 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          ctx!.drawImage(v, 0, 0, canvas.width, canvas.height);
          const image = ctx!.getImageData(0, 0, canvas.width, canvas.height);
          const qr = decode(image.data, image.width, image.height);
          if (qr?.data) {
            setCredential(qr.data);
            void inspect(qr.data);
            return;
          }
        }
        timer.current = setTimeout(frame, 180);
      }
      frame();
    } catch {
      if (run === generation.current) {
        stop();
        setError('Kamera tidak dapat dibuka. Periksa izin kamera atau gunakan nomor tiket.');
      }
    }
  }

  const filteredHistory =
    report?.history.filter(item => {
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        item.attendeeName.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.seatLabel.toLowerCase().includes(q) ||
        item.categoryName.toLowerCase().includes(q)
      );
    }) ?? [];

  return (
    <main id="main" className="container section checkin-page">
      <Link className="text-link" href="/account">
        Kembali ke akun
      </Link>
      <div className="checkin-heading">
        <ScanLine size={40} />
        <h1>Check-in petugas</h1>
      </div>
      {!events.length ? (
        <p>Belum ada event yang ditugaskan. Hubungi organizer.</p>
      ) : (
        <>
          <label className="checkin-event">
            Event bertugas
            <select
              value={slug}
              disabled={busy}
              onChange={e => {
                stop();
                setSlug(e.target.value);
                setResult(null);
                setCredential('');
                setError('');
              }}
            >
              {events.map(e => (
                <option value={e.slug} key={e.slug}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>

          <div className="checkin-grid">
            <section className="checkin-camera">
              <h2>Arahkan ke QR tiket</h2>
              <p>Scan QR, periksa peserta, lalu konfirmasi masuk.</p>
              <video
                ref={video}
                playsInline
                muted
                aria-label="Pratinjau kamera pemindai QR"
                style={{ display: camera ? 'block' : 'none' }}
              />
              {!camera && (
                <div className="scanner-placeholder">
                  <ScanLine size={100} />
                  <span>Kamera belum aktif</span>
                </div>
              )}
              <button className="button" disabled={busy} onClick={() => (camera ? stop() : void start())}>
                <Camera size={20} />
                {camera ? 'Hentikan kamera' : 'Buka kamera'}
              </button>
            </section>

            <section className="checkin-manual">
              <h2>Cari tiket manual</h2>
              <p>Gunakan nomor SPT atau token QR.</p>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void inspect(credential);
                }}
              >
                <label>
                  Nomor tiket atau token QR
                  <input
                    value={credential}
                    onChange={e => {
                      setCredential(e.target.value);
                      setResult(null);
                    }}
                    required
                    maxLength={100}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="SPT-..."
                    disabled={busy}
                  />
                </label>
                <button className="button button-dark" disabled={busy || !credential.trim()}>
                  {busy ? 'Memeriksa...' : 'Periksa tiket'}
                </button>
              </form>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {result && (
                <div className={`checkin-result result-${result.status.toLowerCase()}`} role="status">
                  <h3>{outcomeLabels[result.status]}</h3>
                  {result.ticket && (
                    <dl>
                      <dt>Peserta</dt>
                      <dd>{result.ticket.attendeeName}</dd>
                      <dt>Kursi / kategori</dt>
                      <dd>
                        {result.ticket.seatLabel} / {result.ticket.categoryName}
                      </dd>
                      <dt>Referensi</dt>
                      <dd>{result.ticket.reference}</dd>
                      {result.ticket.checkedInAt && (
                        <>
                          <dt>Waktu masuk</dt>
                          <dd>
                            {new Date(result.ticket.checkedInAt).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                            })}{' '}
                            WIB
                          </dd>
                        </>
                      )}
                    </dl>
                  )}
                  {result.status === 'VALID' && (
                    <button className="button" disabled={busy} onClick={() => void inspect(credential, true)}>
                      Konfirmasi masuk
                    </button>
                  )}
                  {result.status === 'ALREADY_USED' && result.ticket && (
                    <button
                      type="button"
                      className="button button-outline"
                      style={{
                        marginTop: '14px',
                        borderColor: '#c62828',
                        color: '#c62828',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                      }}
                      onClick={() => {
                        setCorrectingTicket({
                          ticketId: result.ticket!.id,
                          reference: result.ticket!.reference,
                          attendeeName: result.ticket!.attendeeName,
                          seatLabel: result.ticket!.seatLabel,
                        });
                        setCorrectErrorMessage('');
                      }}
                    >
                      <RotateCcw size={16} />
                      Koreksi Check-in Ini
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          <section className="staff-report-section" aria-labelledby="report-heading">
            <div className="staff-report-header">
              <h2 id="report-heading">Laporan & Riwayat Check-in</h2>
              <button
                className="button button-outline"
                style={{ fontSize: '13px', padding: '10px 16px' }}
                disabled={loadingHistory}
                onClick={() => void fetchReport(slug)}
              >
                <RefreshCw size={16} />
                {loadingHistory ? 'Memuat data...' : 'Perbarui data'}
              </button>
            </div>

            <div className="staff-kpis">
              <div className="staff-kpi">
                <div className="staff-kpi-header">
                  <span>Check-in oleh Saya</span>
                  <UserCheck size={18} />
                </div>
                <strong>{report?.totalCheckedInByMe ?? 0}</strong>
                <span className="staff-kpi-sub">Tiket divalidasi oleh Anda</span>
              </div>

              <div className="staff-kpi">
                <div className="staff-kpi-header">
                  <span>Kehadiran Acara</span>
                  <Users size={18} />
                </div>
                <strong>
                  {report?.totalEventCheckedIn ?? 0}{' '}
                  <span style={{ fontSize: '1.2rem', color: 'var(--muted)', fontWeight: 400 }}>
                    / {report?.totalSold ?? 0}
                  </span>
                </strong>
                <div className="staff-kpi-badge">
                  {report?.attendanceRate ?? 0}% Hadir
                </div>
              </div>

              <div className="staff-kpi">
                <div className="staff-kpi-header">
                  <span>Waktu Terakhir</span>
                  <Clock size={18} />
                </div>
                <strong style={{ fontSize: report?.lastCheckedInAt ? '1.5rem' : '1.4rem' }}>
                  {report?.lastCheckedInAt
                    ? new Date(report.lastCheckedInAt).toLocaleTimeString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }) + ' WIB'
                    : 'Belum ada'}
                </strong>
                <span className="staff-kpi-sub">Validasi terakhir oleh Anda</span>
              </div>
            </div>

            {correctSuccessMessage && (
              <div
                style={{
                  background: '#e8f5e9',
                  border: '1.5px solid #2e7d32',
                  color: '#1b5e20',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                <CheckCircle2 size={20} color="#2e7d32" />
                <span>{correctSuccessMessage}</span>
              </div>
            )}

            <div className="checkin-history-container">
              <div className="view-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'history'}
                  className={`view-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  <History size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
                  Riwayat Masuk ({filteredHistory.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'audit'}
                  className={`view-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  <FileText size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
                  Log Koreksi & Audit ({report?.audits?.length ?? 0})
                </button>
              </div>

              {activeTab === 'history' ? (
                <>
                  <div className="history-controls">
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                      Riwayat Masuk ({filteredHistory.length})
                    </h3>
                    <div className="history-search">
                      <Search size={18} />
                      <input
                        type="search"
                        placeholder="Cari nama peserta, nomor tiket, atau kursi..."
                        value={historySearch}
                        onChange={e => setHistorySearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {filteredHistory.length === 0 ? (
                    <div className="history-empty">
                      <p>
                        {historySearch.trim()
                          ? 'Tidak ditemukan riwayat yang sesuai dengan pencarian.'
                          : 'Belum ada peserta yang check-in untuk event ini.'}
                      </p>
                    </div>
                  ) : (
                    <div className="history-table-wrap">
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>Waktu Masuk</th>
                            <th>Peserta</th>
                            <th>Kursi & Kategori</th>
                            <th>Nomor Tiket</th>
                            <th>Petugas</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHistory.map(item => (
                            <tr key={item.ticketId}>
                              <td>
                                <strong>
                                  {new Date(item.checkedInAt).toLocaleTimeString('id-ID', {
                                    timeZone: 'Asia/Jakarta',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}{' '}
                                  WIB
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                                  {new Date(item.checkedInAt).toLocaleDateString('id-ID', {
                                    timeZone: 'Asia/Jakarta',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </td>
                              <td>
                                <strong>{item.attendeeName}</strong>
                              </td>
                              <td>
                                {item.seatLabel}{' '}
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                  ({item.categoryName})
                                </span>
                              </td>
                              <td>
                                <code>{item.reference}</code>
                              </td>
                              <td>
                                {item.isMe ? (
                                  <span className="history-badge-me">Saya</span>
                                ) : (
                                  <span className="history-badge-other">Petugas lain</span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="button-koreksi"
                                  title="Batalkan check-in tiket ini jika terjadi kesalahan scan"
                                  onClick={() => {
                                    setCorrectingTicket({
                                      ticketId: item.ticketId,
                                      reference: item.reference,
                                      attendeeName: item.attendeeName,
                                      seatLabel: item.seatLabel,
                                    });
                                    setCorrectErrorMessage('');
                                  }}
                                >
                                  <RotateCcw
                                    size={13}
                                    style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }}
                                  />
                                  Koreksi
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="history-controls">
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                      Log Audit Koreksi ({report?.audits?.length ?? 0})
                    </h3>
                  </div>

                  {!report?.audits?.length ? (
                    <div className="history-empty">
                      <p>Belum ada riwayat koreksi check-in untuk event ini.</p>
                    </div>
                  ) : (
                    <div className="history-table-wrap">
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th>Waktu Koreksi</th>
                            <th>Peserta & Tiket</th>
                            <th>Tindakan & Alasan</th>
                            <th>Petugas</th>
                            <th>Check-in Semula</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.audits.map(audit => (
                            <tr key={audit.id}>
                              <td>
                                <strong>
                                  {new Date(audit.performedAt).toLocaleTimeString('id-ID', {
                                    timeZone: 'Asia/Jakarta',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}{' '}
                                  WIB
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                                  {new Date(audit.performedAt).toLocaleDateString('id-ID', {
                                    timeZone: 'Asia/Jakarta',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </td>
                              <td>
                                <strong>{audit.attendeeName}</strong>
                                <span style={{ fontSize: '12px', display: 'block', color: 'var(--ink)' }}>
                                  <code>{audit.reference}</code>
                                </span>
                              </td>
                              <td>
                                <span className="audit-badge" style={{ marginBottom: '4px' }}>
                                  DIBATALKAN
                                </span>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', fontWeight: 500 }}>
                                  {audit.reason}
                                </p>
                              </td>
                              <td>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                                  {audit.performedByName || 'Petugas'}
                                </span>
                              </td>
                              <td>
                                {audit.previousCheckedInAt ? (
                                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                    {new Date(audit.previousCheckedInAt).toLocaleTimeString('id-ID', {
                                      timeZone: 'Asia/Jakarta',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}{' '}
                                    WIB
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {correctingTicket && (
            <div
              className="correction-modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="correction-dialog-title"
            >
              <div className="correction-modal">
                <button
                  type="button"
                  className="correction-modal-close"
                  onClick={() => {
                    if (!correctBusy) setCorrectingTicket(null);
                  }}
                  aria-label="Tutup dialog koreksi"
                >
                  <X size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <RotateCcw size={22} color="#c62828" />
                  <h3 id="correction-dialog-title" style={{ margin: 0 }}>
                    Koreksi Status Check-in
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px' }}>
                  Tindakan ini akan membatalkan status check-in tiket, sehingga peserta dapat melakukan scan masuk kembali. Setiap tindakan akan tercatat dalam log audit.
                </p>

                <div className="correction-ticket-info">
                  <div>
                    <span style={{ color: 'var(--muted)' }}>Peserta:</span>
                    <strong>{correctingTicket.attendeeName}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)' }}>Nomor Tiket:</span>
                    <code>{correctingTicket.reference}</code>
                  </div>
                  {correctingTicket.seatLabel && (
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Kursi:</span>
                      <span>{correctingTicket.seatLabel}</span>
                    </div>
                  )}
                </div>

                <form
                  className="correction-form"
                  onSubmit={e => {
                    e.preventDefault();
                    void handleRevert();
                  }}
                >
                  <label>
                    Pilih Alasan Koreksi
                    <select
                      value={correctPreset}
                      disabled={correctBusy}
                      onChange={e => setCorrectPreset(e.target.value)}
                    >
                      <option value="Salah scan tiket">Salah scan tiket</option>
                      <option value="Pengunjung keluar sementara">Pengunjung keluar sementara</option>
                      <option value="Tiket tertukar">Tiket tertukar</option>
                      <option value="Lainnya">Lainnya (Tulis catatan khusus)</option>
                    </select>
                  </label>

                  <label>
                    {correctPreset === 'Lainnya' ? 'Catatan Tambahan (Wajib diisi)*' : 'Catatan Tambahan (Opsional)'}
                    <textarea
                      placeholder={
                        correctPreset === 'Lainnya'
                          ? 'Jelaskan alasan pembatalan check-in (min. 3 karakter)...'
                          : 'Keterangan tambahan jika diperlukan...'
                      }
                      value={correctNote}
                      disabled={correctBusy}
                      required={correctPreset === 'Lainnya'}
                      onChange={e => setCorrectNote(e.target.value)}
                      maxLength={300}
                    />
                  </label>

                  {correctErrorMessage && (
                    <p className="form-error" style={{ marginTop: '8px' }} role="alert">
                      {correctErrorMessage}
                    </p>
                  )}

                  <div className="correction-actions">
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={correctBusy}
                      onClick={() => setCorrectingTicket(null)}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="button button-dark"
                      style={{ background: '#c62828', color: '#fff', borderColor: '#b71c1c' }}
                      disabled={correctBusy}
                    >
                      {correctBusy ? 'Memproses koreksi...' : 'Batalkan Check-in'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
