import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { authMode } from '@/lib/auth/config';
import { hasDemoSession } from '@/lib/auth/session';
import { emailRedirectOrigin, sameOrigin, requestOrigin } from '@/lib/auth/request';
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
    if (!hasDemoSession(email)) {
      return NextResponse.redirect(new URL(`/forgot-password?error=email_not_registered&email=${encodeURIComponent(email)}`, requestOrigin(request)), 303);
    }
    // In demo mode, provide direct simulation link so it can be tested instantly
    const demoToken = Buffer.from(email).toString('base64url');
    return NextResponse.redirect(new URL(`/forgot-password?sent=1&email=${encodeURIComponent(email)}&demoToken=${encodeURIComponent(demoToken)}`, requestOrigin(request)), 303);
  }

  const client = await supabaseServer();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.redirect(new URL('/forgot-password?error=Konfigurasi+verifikasi+email+belum+lengkap.', requestOrigin(request)), 303);
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  let registered = false;

  while (!registered) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, requestOrigin(request)), 303);
    }
    registered = data.users.some(user => user.email?.trim().toLowerCase() === normalizedEmail);
    if (registered || data.users.length < 1000) break;
    page += 1;
  }

  if (!registered) {
    return NextResponse.redirect(new URL(`/forgot-password?error=email_not_registered&email=${encodeURIComponent(email)}`, requestOrigin(request)), 303);
  }

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${emailRedirectOrigin(request)}/auth/callback?next=${encodeURIComponent('/reset-password')}`
  });

  if (error) {
    return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(error.message)}`, requestOrigin(request)), 303);
  }

  return NextResponse.redirect(new URL(`/forgot-password?sent=1&email=${encodeURIComponent(email)}`, requestOrigin(request)), 303);
}
