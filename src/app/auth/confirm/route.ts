import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { confirmEmailToken } from '@/lib/auth/email-confirmation';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let destination: string | null = null;
  try {
    destination = await confirmEmailToken(params, await supabaseServer());
  } catch {
    // Do not expose tokens or provider errors in redirects/logs.
  }
  const failure = params.get('type') === 'recovery'
    ? '/forgot-password?error=link_invalid'
    : '/verify-email?error=link_invalid';
  const response = NextResponse.redirect(new URL(destination ?? failure, request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
