import Link from 'next/link';
import { Lock, ArrowUpRight, CheckCircle } from 'lucide-react';

export const metadata = { title: 'Reset Kata Sandi' };

export default async function ResetPassword({
  searchParams
}: {
  searchParams: Promise<{ token?: string; email?: string; error?: string; success?: string }>
}) {
  const params = await searchParams;
  const success = params.success === '1';

  return (
    <main id="main" className="container section auth-grid">
      <div className="auth-art">
        <Lock size={58} />
        <h1>Kata Sandi<br />Baru</h1>
        <p>Pilih kata sandi baru yang kuat dan unik untuk melindungi akun dan reservasi Anda.</p>
        <div className="auth-art-shapes" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>

      <section className="auth-panel">
        <h2>Buat Kata Sandi Baru</h2>

        {success ? (
          <div style={{ display: 'grid', gap: 20 }}>
            <div className="reservation-notice" role="status" style={{ background: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={22} />
              <span>Kata sandi Anda berhasil diperbarui! Silakan masuk dengan kata sandi baru.</span>
            </div>

            <Link className="button" href="/login">
              Masuk Sekarang
              <ArrowUpRight size={18} />
            </Link>
          </div>
        ) : (
          <>
            <p>Masukkan kata sandi baru Anda (minimal 6 karakter).</p>

            {params.error && (
              <div className="form-error" role="alert">
                {params.error}
              </div>
            )}

            <form action="/api/auth/reset-password" method="post" className="auth-form">
              {params.token && <input type="hidden" name="token" value={params.token} />}

              <label>
                Kata Sandi Baru
                <input name="password" type="password" autoComplete="new-password" required minLength={6} maxLength={128} placeholder="Minimal 6 karakter" />
              </label>

              <label>
                Konfirmasi Kata Sandi Baru
                <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} maxLength={128} placeholder="Ulangi kata sandi baru" />
              </label>

              <button className="button" type="submit">
                Simpan Kata Sandi Baru
                <ArrowUpRight size={18} />
              </button>
            </form>

            <p className="auth-note">
              Batal reset? <Link className="text-link" href="/login">Kembali ke login</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}

