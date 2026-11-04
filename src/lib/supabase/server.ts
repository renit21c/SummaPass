import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authMode } from '@/lib/auth/config';
export async function supabaseServer() {
  if (authMode() !== 'supabase') throw new Error('Supabase tidak aktif pada mode demo.');
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: values => {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch { /* Server Components cannot write cookies. Route handlers persist refreshes. */ }
    } },
  });
}
