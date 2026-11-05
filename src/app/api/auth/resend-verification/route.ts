import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode } from '@/lib/auth/config';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
import { supabaseServer } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().email().max(254)
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });

  let email = '';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json = await request.json().catch(() => ({}));
    email = json.email ?? '';
  } else {
    const form = await request.formData();
    email = String(form.get('email') ?? '');
  }

  const parsed = schema.safeParse({ email });
  if (!parsed.success) {
    return NextResponse.redirect(new URL('/verify-email?error=invalid_email', requestOrigin(request)), 303);
  }

  if (authMode() === 'supabase') {
    const client = await supabaseServer();
    const { error } = await client.auth.resend({
      type: 'signup',
      email: parsed.data.email
    });
    if (error) {
      return NextResponse.redirect(new URL(`/verify-email?email=${encodeURIComponent(parsed.data.email)}&error=${encodeURIComponent(error.message)}`, requestOrigin(request)), 303);
    }
  }

  return NextResponse.redirect(new URL(`/verify-email?email=${encodeURIComponent(parsed.data.email)}&resent=1`, requestOrigin(request)), 303);
}

