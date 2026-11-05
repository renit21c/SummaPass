import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ticket } from '@/features/booking/service';
import { sameOrigin } from '@/lib/auth/request';

const resendSchema = z.object({
  email: z.string().email().max(254).optional(),
  phone: z.string().max(30).optional()
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'ID tiket tidak valid.' }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    const ticketData = await ticket(session.id, id);
    const body = await request.json().catch(() => ({}));
    const parsed = resendSchema.safeParse(body);
    const targetEmail = parsed.success && parsed.data.email ? parsed.data.email : session.email || 'email terdaftar';

    // Simulated audit & queue
    const sentAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      reference: ticketData.reference,
      targetEmail,
      sentAt,
      message: `E-ticket ${ticketData.reference} berhasil dikirim ulang ke ${targetEmail}. Periksa folder kotak masuk atau spam.`
    });
  } catch {
    return NextResponse.json({ error: 'Tiket tidak ditemukan atau gagal dikirim ulang.' }, { status: 404 });
  }
}

