import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, UserPlus } from 'lucide-react';
import { authMode, safeReturnPath } from '@/lib/auth/config';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Daftar Akun' };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const mode = authMode();

  if (await getSession()) redirect(next);

  return (
    <main id="main" className="container section auth-grid">
      <div className="auth-art">
        <UserPlus size={58} />
        <h1>Buat Akun<br />SummaPass</h1>
        <p>Daftar sekarang untuk memesan tiket, menyimpan event favorit, dan mengelola reservasi Anda.</p>
        <div className="auth-art-shapes" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>

      <section className="auth-panel">
        <h2>Daftar Akun Baru</h2>
        <p>{mode === 'demo' ? 'Mode Demo: Masukkan nama dan email Anda untuk membuat akun demo instan.' : 'Lengkapi data pendaftaran akun SummaPass.'}</p>

        {params.error && (
          <div className="form-error" role="alert">
            {params.error}
          </div>
        )}

        <form action="/api/auth/register" method="post" className="auth-form">
          <input type="hidden" name="next" value={next} />
          
          <label>
            Nama Lengkap
            <input name="name" type="text" autoComplete="name" required maxLength={100} placeholder="Nama sesuai KTP/ID" />
          </label>

          <label>
            Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="nama@email.com" />
          </label>

          <label>
            Nomor Telepon / WhatsApp
            <input name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="08xxxxxxxxxx (opsional)" />
          </label>

          <label>
            Kata Sandi
            <input name="password" type="password" autoComplete="new-password" required minLength={6} maxLength={128} placeholder="Minimal 6 karakter" />
          </label>

          <label>
            Konfirmasi Kata Sandi
            <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={6} maxLength={128} placeholder="Ulangi kata sandi" />
          </label>

          <button className="button" type="submit">
            Daftar Sekarang
            <ArrowUpRight size={18} />
          </button>
        </form>

        <p className="auth-note">
          Sudah punya akun? <Link className="text-link" href={`/login?next=${encodeURIComponent(next)}`}>Masuk di sini</Link>
        </p>
      </section>
    </main>
  );
}

