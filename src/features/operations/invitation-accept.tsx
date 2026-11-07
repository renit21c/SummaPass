'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
export function InvitationAccept({ id, eventTitle, status, expiresAt }: { id: string; eventTitle: string; status: string; expiresAt: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const router = useRouter();
  async function accept() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/staff/invitations/${id}`, { method: 'POST' }); const data = await response.json();
      if (!response.ok) throw Error(data.error ?? 'Undangan belum dapat diterima.');
      router.replace('/staff'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Coba lagi.'); setBusy(false); }
  }
  return <section className="operations-card"><div className="page-heading"><h1>Undangan petugas</h1></div><h2>{eventTitle}</h2><p>Status: {status}</p><p>Berlaku sampai {new Date(expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.</p>{status === 'PENDING' && <button className="button" disabled={busy} onClick={() => void accept()}>{busy ? 'Memproses...' : 'Terima undangan'}</button>}{status === 'ACCEPTED' && <Link className="button" href="/staff">Buka halaman staff</Link>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
