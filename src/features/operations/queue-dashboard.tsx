'use client';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { queuePage, type QueuePage } from './contracts';
const labels: Record<string, string> = { PENDING: 'Antre', PROCESSING: 'Diproses', RETRY: 'Menunggu ulang', SENT: 'Diterima provider', FAILED: 'Gagal', SKIPPED: 'Dilewati', DELIVERED: 'Tiba di server penerima', BOUNCED: 'Ditolak penerima', COMPLAINED: 'Dilaporkan spam', DELAYED: 'Tertunda', DELIVERY_FAILED: 'Pengiriman gagal', SUPPRESSED: 'Diblokir provider', ACCEPTED: 'Diterima provider' };
export function QueueDashboard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<QueuePage | null>(null), [filter, setFilter] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [retryId, setRetryId] = useState(''), [reason, setReason] = useState('');
  async function load(cursor?: string | null, signal?: AbortSignal) {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams(); if (filter) query.set('status', filter); if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/organizer/events/${eventId}/notifications?${query}`, { cache: 'no-store', signal });
      const body = await response.json(); if (!response.ok) throw Error(body.error ?? 'Antrean belum dapat dimuat.');
      const next = queuePage.parse(body); if (!signal?.aborted) setData(previous => cursor && previous ? { ...next, items: [...previous.items, ...next.items] } : next);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Antrean belum dapat dimuat.'); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  useEffect(() => { setData(null); const controller = new AbortController(); void load(null, controller.signal); return () => controller.abort(); }, [eventId, filter]);
  async function retry() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/organizer/events/${eventId}/notifications`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: retryId, reason }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error ?? 'Job belum dapat diantrekan.');
      setRetryId(''); setReason(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Coba lagi.'); }
    finally { setBusy(false); }
  }
  return <section className="operations-card"><div className="operations-title"><h2>Antrean pengiriman</h2><button className="button button-light" disabled={busy} onClick={() => void load()}><RefreshCw size={17} aria-hidden="true" /> Perbarui</button></div><p>Status diterima provider belum memastikan email tiba di inbox.</p>
    <div className="operations-counts">{Object.entries(data?.counts ?? {}).map(([status, count]) => <span key={status}>{labels[status] ?? status}: <strong>{count}</strong></span>)}</div>
    <label>Status<select value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}><option value="">Semua</option>{['PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED', 'SKIPPED'].map(status => <option key={status} value={status}>{labels[status]}</option>)}</select></label>
    {error && <p role="alert" className="form-error">{error}</p>}{busy && <p role="status">Memuat...</p>}
    {data && !data.items.length && <p>Belum ada pengiriman.</p>}
    {!!data?.items.length && <div className="operations-table"><table><thead><tr><th>Jenis / waktu</th><th>Status</th><th>Percobaan</th><th>Catatan</th><th>Tindakan</th></tr></thead><tbody>{data.items.map(job => <tr key={job.id}><td>{job.kind}<small>{new Date(job.createdAt).toLocaleString('id-ID')}</small></td><td>{labels[job.status]}{job.deliveryStatus && <small>{labels[job.deliveryStatus] ?? job.deliveryStatus}</small>}</td><td>{job.attempts}/5</td><td>{job.errorCode ?? '-'}</td><td>{job.canRetry ? <button className="text-link" disabled={busy} onClick={() => { setRetryId(job.id); setReason(''); }}>Antrekan ulang</button> : <span>-</span>}</td></tr>)}</tbody></table></div>}
    {data?.nextCursor && <button className="button button-light" disabled={busy} onClick={() => void load(data.nextCursor)}>Muat berikutnya</button>}
    {retryId && <form className="operations-retry" onSubmit={e => { e.preventDefault(); void retry(); }}><h3>Antrekan ulang</h3><p>Payload, kunci idempotensi, batas 5 percobaan, dan batas 23 jam tetap berlaku.</p><label>Alasan<textarea required minLength={10} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="operations-actions"><button className="button" disabled={busy}>Konfirmasi</button><button className="button button-light" type="button" disabled={busy} onClick={() => setRetryId('')}>Tutup</button></div></form>}
  </section>;
}
