'use client';
import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import Link from 'next/link';
import { useConfirmation } from '@/components/confirmation-dialog';
import { useEffect, useRef, useState } from 'react';
import { Mail, Send, Ban, RefreshCw } from 'lucide-react';
import { invitationSchema, type Invitation } from './contracts';

export function EventOperations({ eventId, cancelledAt }: { eventId: string; cancelledAt?: string | null }) {
  const confirmAction=useConfirmation();
  const [items, setItems] = useState<Invitation[]>([]), [email, setEmail] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(''), [cancelled, setCancelled] = useState(!!cancelledAt);
  const inviteKey = useRef(crypto.randomUUID()), cancelKey = useRef(crypto.randomUUID());
  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch(`/api/organizer/events/${eventId}/invitations`, { cache: 'no-store', signal });
      const data: unknown = await response.json();
      if (!response.ok) throw Error('Undangan belum dapat dimuat.');
      if (!signal?.aborted) setItems(invitationSchema.array().parse(data));
    } catch { if (!signal?.aborted) setError('Undangan belum dapat dimuat. Coba lagi.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [eventId]);
  async function mutate(url: string, body: unknown, method = 'POST') {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw Error(data.error ?? 'Permintaan gagal.');
      await load(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Permintaan gagal.'); return false; }
    finally { setBusy(false); }
  }
  return <section className="operations-card" aria-labelledby="operations-heading">
    <div className="operations-title"><h2 id="operations-heading"><Mail size={22} aria-hidden="true" /> Undangan petugas</h2><Link className="button button-light button-small" href={`/organizer/events/${eventId}/notifications`}>Antrean email</Link></div>
    {!cancelled && <ValidatedForm className="operations-form" onSubmit={async e => { e.preventDefault(); if (await mutate(`/api/organizer/events/${eventId}/invitations`, { email, key: inviteKey.current })) { setEmail(''); inviteKey.current = crypto.randomUUID(); setMessage('Undangan masuk antrean email. Berlaku 7 hari.'); } }}>
      <FieldLabel>Email petugas<input type="email" required maxLength={254} value={email} onChange={e => { setEmail(e.target.value); inviteKey.current = crypto.randomUUID(); }} placeholder="petugas@contoh.com" /></FieldLabel>
      <button className="button" disabled={busy}><Send size={17} aria-hidden="true" /> Kirim undangan</button>
    </ValidatedForm>}
    <p>Petugas mendaftar atau login dengan email penerima, lalu menerima undangan.</p>
    {loading ? <p role="status">Memuat undangan...</p> : !items.length ? <p>Belum ada undangan.</p> : <ul className="operations-list">{items.map(item => <li key={item.id}><div><strong>{item.email}</strong><span>{item.status} · berakhir {new Date(item.expiresAt).toLocaleDateString('id-ID')}</span></div>{item.status === 'PENDING' && <div className="operations-actions"><button className="button button-light button-small" disabled={busy} onClick={async () => { if (await mutate(`/api/organizer/invitations/${item.id}`, { action: 'resend', key: crypto.randomUUID() }, 'PATCH')) setMessage('Pengiriman ulang masuk antrean.'); }}>Kirim ulang</button><button className="text-link" disabled={busy} onClick={async () => { if (await confirmAction('Penerima tidak lagi dapat menerima undangan ini.',{title:'Cabut undangan petugas?',confirmLabel:'Cabut undangan',destructive:true})) void mutate(`/api/organizer/invitations/${item.id}`, { action: 'revoke', key: crypto.randomUUID() }, 'PATCH'); }}>Cabut</button></div>}</li>)}</ul>}
    <button data-icon-action="" aria-label="Muat ulang data" title="Muat ulang data" className="text-link" disabled={busy || loading} onClick={() => { setError(''); void load(); }}><RefreshCw size={20} aria-hidden="true" /></button>
    <div className="operations-danger">
      <h3><Ban size={20} aria-hidden="true" /> Pembatalan event</h3>
      {cancelled ? <p role="status">Acara dibatalkan. Tiket dicabut dan pesanan baru ditutup.</p> : <details><summary>Batalkan acara</summary><p>Tiket akan dicabut dan reservasi dilepas. Riwayat pembayaran tetap tersimpan. Refund tidak diproses.</p><ValidatedForm onSubmit={async e => { e.preventDefault(); if (!await confirmAction('Tiket akan dicabut dan pesanan baru ditutup. Riwayat pembayaran tetap tersimpan. Pembatalan ini tidak memproses refund.',{title:'Batalkan acara?',confirmLabel:'Batalkan acara',destructive:true})) return; if (await mutate(`/api/organizer/events/${eventId}/cancel`, { reason, key: cancelKey.current })) { setCancelled(true); setMessage('Acara dibatalkan. Pemberitahuan masuk antrean.'); window.location.reload(); } }}><FieldLabel>Alasan pembatalan<textarea required minLength={10} maxLength={1000} value={reason} onChange={e => { setReason(e.target.value); cancelKey.current = crypto.randomUUID(); }} /></FieldLabel><button className="button button-light" disabled={busy}>Konfirmasi pembatalan</button></ValidatedForm></details>}
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}
