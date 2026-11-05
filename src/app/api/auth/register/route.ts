import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode, safeReturnPath } from '@/lib/auth/config';
import { createCustomDemoSession } from '@/lib/auth/session';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
import { supabaseServer } from '@/lib/supabase/server';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi.').max(100),
  email: z.string().email('Format email tidak valid.').max(254),
  phone: z.string().trim().max(30).optional().default(''),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter.').max(128),
  confirmPassword: z.string().min(6).max(128)
}).refine(data => data.password === data.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok.',
  path: ['confirmPassword']
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  const form = await request.formData();
  const next = safeReturnPath(form.get('next'));
  const raw = {
    name: form.get('name'),
    email: form.get('email'),
    phone: form.get('phone') ?? '',
    password: form.get('password'),
    confirmPassword: form.get('confirmPassword')
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Data pendaftaran belum valid.';
    return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}`, requestOrigin(request)), 303);
  }

  const { name, email, phone, password } = parsed.data;

  if (authMode() === 'demo') {
    await createCustomDemoSession({ name, email, phone });
    return NextResponse.redirect(new URL(next, requestOrigin(request)), 303);
  }

  const client = await supabaseServer();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${requestOrigin(request)}/auth/callback?next=${encodeURIComponent('/verify-email?verified=1')}`,
      data: {
        display_name: name,
        phone
      }
    }
  });

  if (error) {
    return NextResponse.redirect(new URL(`/register?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`, requestOrigin(request)), 303);
  }

  // If Supabase requires email verification (no session yet)
  if (!data.session) {
    return NextResponse.redirect(new URL(`/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, requestOrigin(request)), 303);
  }

  return NextResponse.redirect(new URL(next, requestOrigin(request)), 303);
}
