import { requestLimit } from '@/lib/rate-limit/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { transferTicket } from '@/features/booking/service';
import { failure } from '@/features/booking/http';

const transferSchema = z.object({
  attendeeName: z.string().trim().min(2, 'Nama peserta baru minimal 2 karakter.').max(100, 'Nama terlalu panjang.'),
  attendeeEmail: z.string().trim().email('Format email tidak valid.').optional().or(z.literal('')),
  reason: z.string().max(200).optional(),
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

    const input = transferSchema.parse(body);
    const result = await transferTicket(
      user.id,
      id,
      input.attendeeName,
      input.attendeeEmail || undefined,
      input.reason
    );

    return NextResponse.json({
      success: true,
      message: `Tiket berhasil dialihkan kepada ${input.attendeeName}. Kode QR e-ticket telah diperbarui secara aman.`,
      ...result
    }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}

