import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth/config';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeReturnPath(searchParams.get('next'));

  if (code) {
    try {
      const client = await supabaseServer();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, origin));
      }
    } catch {
      // Ignore and fallback to login
    }
  }

  return NextResponse.redirect(new URL('/login?error=verification_failed', origin));
}

