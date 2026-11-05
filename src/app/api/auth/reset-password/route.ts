import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode } from '@/lib/auth/config';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
import { supabaseServer } from '@/lib/supabase/server';

const schema = z.object({
  password: z.string().min(6, 'Kata sandi minimal 6 karakter.').max(128),
  confirmPassword: z.string().min(6).max(128),
  token: z.string().optional()
}).refine(data => data.password === data.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak cocok.',
  path: ['confirmPassword']
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });

  const form = await request.formData();
  const raw = {
    password: form.get('password'),
    confirmPassword: form.get('confirmPassword'),
    token: form.get('token') ? String(form.get('token')) : undefined
  };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Kata sandi belum valid.';
    return NextResponse.redirect(new URL(`/reset-password?error=${encodeURIComponent(message)}`, requestOrigin(request)), 303);
  }

  const { password } = parsed.data;

  if (authMode() === 'supabase') {
    const client = await supabaseServer();
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      return NextResponse.redirect(new URL(`/reset-password?error=${encodeURIComponent(error.message)}`, requestOrigin(request)), 303);
    }
  }

  return NextResponse.redirect(new URL('/reset-password?success=1', requestOrigin(request)), 303);
}

