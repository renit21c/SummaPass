import Link from 'next/link';
import { KeyRound, ArrowUpRight, CheckCircle } from 'lucide-react';
import { authMode } from '@/lib/auth/config';

export const metadata = { title: 'Lupa Kata Sandi' };

export default async function ForgotPassword({
  searchParams
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string; demoToken?: string }>
}) {
  const params = await searchParams;
  const sent = params.sent === '1';
  const mode = authMode();

  return (
    <main id="main" className="container section auth-grid">
      <div className="auth-art">
        <KeyRound size={58} />
        <h1>Atur Ulang<br />Kata Sandi</h1>
        <p>Jangan khawatir jika Anda lupa kata sandi. Kami akan membantu Anda mengatur ulang akun dengan aman.</p>
        <div className="auth-art-shapes" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>

      <section className="auth-panel">
        <h2>Lupa Kata Sandi</h2>
        <p>Masukkan alamat email akun SummaPass Anda untuk menerima tautan pemulihan kata sandi.</p>

        {params.error && (
          <div className="form-error" role="alert">
            {params.error === 'invalid_email' ? 'Format email tidak valid.' : params.error}
          </div>
        )}

        {sent ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="reservation-notice" role="status" style={{ background: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={22} />
              <span>Instruksi pemulihan telah dikirim ke <strong>{params.email}</strong>.</span>
            </div>

            {mode === 'demo' && params.demoToken && (
              <div style={{ padding: 18, background: 'var(--purple-light)', border: '1.5px solid var(--purple)', borderRadius: 10 }}>
                <strong style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--purple)' }}>Mode Demo Instan:</strong>
                <p style={{ fontSize: 13, margin: '0 0 12px' }}>
                  Di lingkungan demo, Anda dapat langsung menguji reset kata sandi menggunakan tautan simulasi berikut:
                </p>
                <Link className="button button-small" href={`/reset-password?token=${params.demoToken}&email=${encodeURIComponent(params.email ?? '')}`}>
                  Buka Form Reset Kata Sandi
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            )}

            <p className="auth-note">
              Sudah ingat kata sandi Anda? <Link className="text-link" href="/login">Kembali ke login</Link>
            </p>
          </div>
        ) : (
          <form action="/api/auth/forgot-password" method="post" className="auth-form">
            <label>
              Alamat Email Terdaftar
              <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nama@email.com" defaultValue={params.email ?? ''} />
            </label>

            <button className="button" type="submit">
              Kirim Tautan Reset
              <ArrowUpRight size={18} />
            </button>
          </form>
        )}

        {!sent && (
          <p className="auth-note">
            Kembali ke <Link className="text-link" href="/login">Halaman Masuk</Link>
          </p>
        )}
      </section>
    </main>
  );
}

