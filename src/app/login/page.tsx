import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, Ticket } from 'lucide-react';
import { authMode, safeReturnPath } from '@/lib/auth/config';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Masuk' };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const mode = authMode();

  if (await getSession()) redirect(next);

  return (
    <main id="main" className="container section auth-grid">
      <div className="auth-art">
        <Ticket size={58} />
        <h1>Masuk ke<br />SummaPass</h1>
        <p>Kelola reservasi dan tiket.</p>
        <div className="auth-art-shapes" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>

      <section className="auth-panel">
        <h2>Masuk</h2>
        <p>{mode === 'demo' ? 'Pilih akses demo. Tidak perlu data pribadi.' : 'Gunakan akun SummaPass.'}</p>

        {params.error && (
          <div className="form-error" role="alert">
            {params.error === 'invalid' ? 'Periksa format email dan isi kata sandi.' : 'Email atau kata sandi belum cocok. Silakan coba lagi.'}
          </div>
        )}

        <form action="/api/auth/login" method="post" className="auth-form">
          <input type="hidden" name="next" value={next} />
          {mode === 'supabase' && (
            <>
              <label>
                Email
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <label>
                Kata sandi
                <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
              </label>
            </>
          )}

          <button className="button" type="submit">
            {mode === 'demo' ? 'Masuk sebagai pengunjung demo' : 'Masuk'}
            <ArrowUpRight size={18} />
          </button>

          {mode === 'demo' && (
            <button className="button button-light" type="submit" name="demoRole" value="organizer">
              Masuk sebagai organizer demo
            </button>
          )}
          {mode === 'demo' && (
            <button className="button button-light" type="submit" name="demoRole" value="staff">
              Masuk sebagai petugas demo
            </button>
          )}
        </form>

        <p className="auth-note">
          Belum punya akun? <Link className="text-link" href={`/register?next=${encodeURIComponent(next)}`}>Daftar akun baru</Link>
        </p>
        <p className="auth-note">
          <Link className="text-link" href="/forgot-password">Lupa kata sandi?</Link>
        </p>
        <Link className="text-link" href="/events">Lihat event dulu</Link>
      </section>
    </main>
  );
}
