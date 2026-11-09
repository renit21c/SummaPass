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
  Download,
  SwitchCamera,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { outcomeLabels, filterCheckInsByPeriod, type CheckInResult, type StaffReport, type CheckInPeriod } from './core';

export function CheckInScanner({ events }: { events: { slug: string; title: string }[] }) {
  const [eventOptions, setEventOptions] = useState(events);
  const [slug, setSlug] = useState(events[0]?.slug ?? '');
  const [credential, setCredential] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [report, setReport] = useState<StaffReport | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [period, setPeriod] = useState<CheckInPeriod>('ALL');
  const [staffScope, setStaffScope] = useState<'all' | 'me'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function refreshEvents() {
    try {
      const response = await fetch('/api/staff/events', { cache: 'no-store' });
      if (!response.ok) return;
      const updated = await response.json() as { slug: string; title: string }[];
      setEventOptions(updated);
      setSlug(current => updated.some(event => event.slug === current) ? current : (updated[0]?.slug ?? ''));
    } catch {
      // Keep the last known assignment list when the network is unavailable.
    }
  }

  useEffect(() => {
    void refreshEvents();
    const onFocus = () => void refreshEvents();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

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

  function playBeep(success = true) {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (success) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // Audio autoplay policy fallback
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(success ? [100] : [100, 60, 100]);
      } catch {}
    }
  }

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
      if (!r.ok) {
        playBeep(false);
        throw Error(data.error);
      }
      setResult(data);
      if (data.status === 'VALID' || data.status === 'CHECKED_IN') {
        playBeep(true);
      } else {
        playBeep(false);
      }
      if (confirm && data.status === 'CHECKED_IN') {
        void fetchReport(slug);
      }
    } catch (e) {
      playBeep(false);
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

  async function start(customFacing?: 'environment' | 'user') {
    stop();
    setResult(null);
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Kamera tidak tersedia di browser ini. Gunakan nomor tiket di bawah.');
      return;
    }
    const targetMode = customFacing ?? facingMode;
    const run = generation.current;
    setCamera(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: targetMode } },
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

  function switchFacingMode() {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (camera) {
      void start(nextMode);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { default: decode } = await import('jsqr');
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setError('Gagal membaca gambar QR.');
          setBusy(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = decode(imgData.data, imgData.width, imgData.height);
        if (qr?.data) {
          setCredential(qr.data);
          void inspect(qr.data);
        } else {
          setError('QR code tidak terdeteksi pada gambar. Pastikan gambar jelas atau gunakan input manual.');
          playBeep(false);
          setBusy(false);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setError('Gagal memuat file gambar.');
        setBusy(false);
      };
      img.src = objectUrl;
    } catch {
      setError('Terjadi kesalahan saat memproses gambar.');
      setBusy(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const periodFiltered = filterCheckInsByPeriod(report?.history ?? [], period);
  const staffFiltered = staffScope === 'me' ? periodFiltered.filter(i => i.isMe) : periodFiltered;
  const filteredHistory =
    staffFiltered.filter(item => {
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
      {!eventOptions.length ? (
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
              {eventOptions.map(e => (
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                <button className="button" disabled={busy} onClick={() => (camera ? stop() : void start())}>
                  <Camera size={18} />
                  {camera ? 'Hentikan kamera' : 'Buka kamera'}
                </button>

                {camera && (
                  <button
                    className="button button-light"
                    type="button"
                    disabled={busy}
                    onClick={switchFacingMode}
                    title={facingMode === 'environment' ? 'Ganti ke kamera depan' : 'Ganti ke kamera belakang'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <SwitchCamera size={18} />
                    <span>{facingMode === 'environment' ? 'Kamera Belakang' : 'Kamera Depan'}</span>
                  </button>
                )}

                <button
                  className="button button-light"
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  title="Pindai QR dari file gambar"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Upload size={18} />
                  <span>Unggah QR</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />

                <button
                  className="button button-light"
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? 'Matikan suara scan' : 'Aktifkan suara scan'}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                  aria-label={soundEnabled ? 'Matikan suara scan' : 'Aktifkan suara scan'}
                >
                  {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              </div>
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
                  <div className="history-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                        Riwayat Masuk ({filteredHistory.length})
                      </h3>
                      <a
                        className="button button-light"
                        href={`/api/staff/export?slug=${encodeURIComponent(slug)}&period=${period}&staff=${staffScope}${historySearch.trim() ? `&q=${encodeURIComponent(historySearch.trim())}` : ''}`}
                        download={`summapass-kehadiran-${slug}.csv`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
                        title="Unduh file CSV riwayat kehadiran"
                      >
                        <Download size={15} />
                        Ekspor CSV
                      </a>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                        <span>Periode:</span>
                        <select
                          value={period}
                          onChange={e => setPeriod(e.target.value as CheckInPeriod)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid var(--ink)',
                            fontSize: '13px',
                            background: 'var(--paper)',
                            color: 'var(--ink)',
                          }}
                        >
                          <option value="ALL">Semua Waktu</option>
                          <option value="1H">1 Jam Terakhir</option>
                          <option value="4H">4 Jam Terakhir</option>
                          <option value="TODAY">Hari Ini</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                        <span>Petugas:</span>
                        <select
                          value={staffScope}
                          onChange={e => setStaffScope(e.target.value as 'all' | 'me')}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid var(--ink)',
                            fontSize: '13px',
                            background: 'var(--paper)',
                            color: 'var(--ink)',
                          }}
                        >
                          <option value="all">Semua Petugas</option>
                          <option value="me">Hanya Saya</option>
                        </select>
                      </label>

                      <div className="history-search" style={{ margin: 0 }}>
                        <Search size={16} />
                        <input
                          type="search"
                          placeholder="Cari nama, tiket, kursi..."
                          value={historySearch}
                          onChange={e => setHistorySearch(e.target.value)}
                          style={{ width: '190px' }}
                        />
                      </div>
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
                  <div className="history-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                      Log Audit Koreksi ({report?.audits?.length ?? 0})
                    </h3>
                    {!!report?.audits?.length && (
                      <a
                        className="button button-light"
                        href={`/api/staff/export?slug=${encodeURIComponent(slug)}&type=audits`}
                        download={`summapass-audit-koreksi-${slug}.csv`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '13px' }}
                        title="Unduh file CSV riwayat log audit"
                      >
                        <Download size={15} />
                        Ekspor Log Audit
                      </a>
                    )}
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
