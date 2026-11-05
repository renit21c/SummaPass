import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, updateSessionProfile } from '@/lib/auth/session';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';

const schema = z.object({
  name: z.string().trim().min(1, 'Nama lengkap wajib diisi.').max(100),
  email: z.string().email('Format email tidak valid.').max(254).optional(),
  phone: z.string().trim().max(30).optional().default(''),
  emailNotify: z.boolean().optional(),
  interestedCategories: z.array(z.string()).optional()
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let payload: unknown;

  if (contentType.includes('application/json')) {
    payload = await request.json().catch(() => ({}));
  } else {
    const form = await request.formData();
    payload = {
      name: form.get('name'),
      email: form.get('email') ? String(form.get('email')).trim() : undefined,
      phone: form.get('phone') ?? '',
      emailNotify: form.get('emailNotify') === 'true' || form.get('emailNotify') === 'on'
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Data profil belum valid.';
    if (contentType.includes('application/json')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.redirect(new URL(`/account?error=${encodeURIComponent(message)}`, requestOrigin(request)), 303);
  }

  const updated = await updateSessionProfile({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    preferences: {
      emailNotify: parsed.data.emailNotify,
      interestedCategories: parsed.data.interestedCategories
    }
  });

  if (contentType.includes('application/json')) {
    return NextResponse.json({ success: true, user: updated });
  }

  return NextResponse.redirect(new URL('/account?saved=1', requestOrigin(request)), 303);
}
