import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode, safeReturnPath } from '@/lib/auth/config';
import { createDemoSession, loginDestination } from '@/lib/auth/session';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
import { supabaseServer } from '@/lib/supabase/server';
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  const form = await request.formData();
  const next = safeReturnPath(form.get('next'));
  if (authMode() === 'demo') {
    const organizerDemo=form.get('demoRole')==='organizer';const staffDemo=form.get('demoRole')==='staff';
    await createDemoSession(staffDemo?'staff':organizerDemo?'organizer':undefined);
    return NextResponse.redirect(new URL(staffDemo?'/staff':organizerDemo?'/organizer':next, requestOrigin(request)), 303);
  }
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return NextResponse.redirect(new URL(`/login?error=invalid&next=${encodeURIComponent(next)}`, requestOrigin(request)), 303);
  const client = await supabaseServer();
  const { data, error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return NextResponse.redirect(new URL(`/login?error=credentials&next=${encodeURIComponent(next)}`, requestOrigin(request)), 303);
  if (!data.user) return NextResponse.redirect(new URL('/login?error=credentials', requestOrigin(request)), 303);
  try {
    const destination = await loginDestination({ id: data.user.id, email: data.user.email ?? '', name: '', mode: 'supabase' }, next);
    return NextResponse.redirect(new URL(destination, requestOrigin(request)), 303);
  } catch {
    return NextResponse.json({ error: 'Akses akun belum dapat diperiksa. Coba masuk lagi.' }, { status: 503 });
  }
}
