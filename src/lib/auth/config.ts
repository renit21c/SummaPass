export type AuthMode = 'demo' | 'supabase';
export function authMode(): AuthMode {
  const mode = process.env.SUMMAPASS_AUTH_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'supabase') throw new Error('SUMMAPASS_AUTH_MODE harus demo atau supabase.');
  if (mode === 'supabase' && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) throw new Error('Konfigurasi Supabase belum lengkap.');
  return mode;
}
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/account';
  // Only allow application destinations; never bounce back into an auth endpoint.
  const pathname = value.split(/[?#]/)[0];
  return ['/account', '/bookings', '/my-tickets', '/organizer', '/staff'].some(p => pathname === p || pathname.startsWith(`${p}/`)) || /^\/events\/[a-z0-9-]+\/seats$/.test(pathname) ? value : '/account';
}
