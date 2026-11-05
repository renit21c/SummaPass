import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode } from '@/lib/auth/config';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
import { supabaseServer } from '@/lib/supabase/server';

const schema = z.object({
  email: z.string().email('Format email tidak valid.').max(254)
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });

  const form = await request.formData();
  const parsed = schema.safeParse({ email: form.get('email') });

  if (!parsed.success) {
    return NextResponse.redirect(new URL('/forgot-password?error=invalid_email', requestOrigin(request)), 303);
  }

  const { email } = parsed.data;

  if (authMode() === 'demo') {
    // In demo mode, provide direct simulation link so it can be tested instantly
    const demoToken = Buffer.from(email).toString('base64url');
    return NextResponse.redirect(new URL(`/forgot-password?sent=1&email=${encodeURIComponent(email)}&demoToken=${encodeURIComponent(demoToken)}`, requestOrigin(request)), 303);
  }

  const client = await supabaseServer();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${requestOrigin(request)}/reset-password`
  });

  if (error) {
    return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, requestOrigin(request)), 303);
  }

  return NextResponse.redirect(new URL(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`, requestOrigin(request)), 303);
}

