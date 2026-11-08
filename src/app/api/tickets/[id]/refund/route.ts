import { requestLimit } from '@/lib/rate-limit/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { refundTicket } from '@/features/booking/service';
import { failure } from '@/features/booking/http';

const schema = z.object({
  reason: z.string().min(3, 'Alasan pembatalan minimal 3 karakter.').max(500, 'Alasan terlalu panjang.')
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  }

  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Silakan masuk kembali.' }, { status: 401 });
  }

  const limited = await requestLimit(request, 'payment', user.id);
  if (limited) return limited;

  try {
    const id = z.string().uuid().parse((await params).id);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const input = schema.parse(body);
    const result = await refundTicket(user.id, id, input.reason);

    return NextResponse.json({
      success: true,
      message: 'Tiket berhasil dibatalkan dan dana simulasi sebesar telah direfund.',
      ...result
    }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}
