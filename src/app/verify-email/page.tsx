import Link from 'next/link';
import { Mail, CheckCircle, AlertCircle, ArrowUpRight } from 'lucide-react';

export const metadata = { title: 'Verifikasi Email' };

export default async function VerifyEmail({
  searchParams
}: {
  searchParams: Promise<{ email?: string; resent?: string; error?: string; verified?: string }>
}) {
  const params = await searchParams;
  const email = params.email ?? '';
  const resent = params.resent === '1';
  const verified = params.verified === '1';

  return (
    <main id="main" className="container section auth-grid">
      <div className="auth-art">
        <Mail size={58} />
        <h1>Verifikasi<br />Email Akun</h1>
        <p>Langkah terakhir sebelum memesan tiket dan menggunakan seluruh fitur SummaPass.</p>
        <div className="auth-art-shapes" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>

      <section className="auth-panel">
        <h2>Periksa Email Anda</h2>
        
        {verified ? (
          <div className="reservation-notice" role="status" style={{ background: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={20} />
            <span>Email Anda telah berhasil diverifikasi! Silakan masuk ke akun Anda.</span>
          </div>
        ) : (
          <p>
            Kami telah mengirimkan tautan konfirmasi ke <strong>{email || 'email Anda'}</strong>. 
            Silakan buka tautan tersebut untuk mengaktifkan akun.
          </p>
        )}

        {resent && (
          <div className="reservation-notice" role="status" style={{ background: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={20} />
            <span>Tautan verifikasi baru berhasil dikirimkan ke kotak masuk Anda.</span>
          </div>
        )}

        {params.error && (
          <div className="form-error" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} />
            <span>{params.error === 'invalid_email' ? 'Format email tidak valid.' : params.error === 'link_invalid' ? 'Tautan verifikasi tidak valid atau sudah kedaluwarsa. Kirim ulang email verifikasi.' : params.error}</span>
          </div>
        )}

        <div style={{ marginTop: 24, padding: 20, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Belum menerima email?</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Periksa folder Spam atau Junk di email Anda, atau klik tombol di bawah untuk mengirim ulang tautan konfirmasi.
          </p>
          <form action="/api/auth/resend-verification" method="post" style={{ display: 'grid', gap: 12 }}>
            <input type="hidden" name="email" value={email} />
            {!email && (
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
                Alamat Email
                <input name="email" type="email" required placeholder="nama@email.com" style={{ minHeight: 44, padding: '8px 12px', border: '1.5px solid var(--ink)', borderRadius: 8 }} />
              </label>
            )}
            <button className="button button-small" type="submit">
              Kirim Ulang Email Verifikasi
              <ArrowUpRight size={16} />
            </button>
          </form>
        </div>

        <p className="auth-note" style={{ marginTop: 24 }}>
          Sudah selesai verifikasi? <Link className="text-link" href="/login">Masuk ke akun</Link>
        </p>
      </section>
    </main>
  );
}

