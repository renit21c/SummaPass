'use client';
import { useState } from 'react';
import { User, Phone, Mail, CheckCircle, Save, BellRing } from 'lucide-react';

export function ProfileEditor({
  initialUser
}: {
  initialUser: { name: string; email: string; phone?: string; preferences?: { emailNotify?: boolean } }
}) {
  const [name, setName] = useState(initialUser.name);
  const [email, setEmail] = useState(initialUser.email);
  const [phone, setPhone] = useState(initialUser.phone ?? '');
  const [emailNotify, setEmailNotify] = useState(initialUser.preferences?.emailNotify ?? true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, emailNotify })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal memperbarui profil.');
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan profil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-card" style={{ background: 'var(--cream)', gridColumn: 'span 2' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <User size={30} style={{ color: 'var(--purple)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Edit Profil & Pengaturan</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Perbarui nama lengkap, alamat email, kontak telepon/WhatsApp, dan preferensi akun Anda.
            </p>
          </div>
        </div>

        {saved && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--mint)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            <CheckCircle size={18} />
            <span>Profil berhasil disimpan!</span>
          </div>
        )}
      </div>

      {error && (
        <div className="form-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      <form className="profile-editor-grid" onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginTop: 24 }}>
        <label style={{ display: 'grid', gap: 8, fontSize: 13, fontWeight: 700 }}>
          Nama Lengkap
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={e => setName(e.target.value)}
            style={{ minHeight: 46, padding: '10px 14px', border: '1.5px solid var(--ink)', borderRadius: 8, background: '#fff' }}
            placeholder="Nama lengkap sesuai identitas"
          />
        </label>

        <label style={{ display: 'grid', gap: 8, fontSize: 13, fontWeight: 700 }}>
          Alamat Email
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Mail size={18} style={{ position: 'absolute', left: 14, color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={e => setEmail(e.target.value)}
              style={{ minHeight: 46, padding: '10px 14px 10px 42px', border: '1.5px solid var(--ink)', borderRadius: 8, background: '#fff', width: '100%' }}
              placeholder="nama@email.com"
            />
          </div>
        </label>

        <label style={{ display: 'grid', gap: 8, fontSize: 13, fontWeight: 700 }}>
          Nomor Telepon / WhatsApp
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Phone size={18} style={{ position: 'absolute', left: 14, color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              type="tel"
              maxLength={30}
              value={phone}
              disabled={busy}
              onChange={e => setPhone(e.target.value)}
              style={{ minHeight: 46, padding: '10px 14px 10px 42px', border: '1.5px solid var(--ink)', borderRadius: 8, background: '#fff', width: '100%' }}
              placeholder="08xxxxxxxxxx (untuk kirim ulang e-ticket)"
            />
          </div>
        </label>

        <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed var(--line)', paddingTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={emailNotify}
              disabled={busy}
              onChange={e => setEmailNotify(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--purple)' }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <BellRing size={16} />
              Kirimkan pengingat jadwal acara dan salinan tiket otomatis ke <strong>{email || initialUser.email}</strong>
            </span>
          </label>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="button" type="submit" disabled={busy}>
            <Save size={18} />
            {busy ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </section>
  );
}
