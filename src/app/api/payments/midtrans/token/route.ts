import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { requestLimit } from '@/lib/rate-limit/server';
import { booking } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
import { createMidtransSnapTransaction } from '@/lib/payments/midtrans';

export const maxDuration = 30;

const requestSchema = z.object({
  bookingId: z.string().uuid('ID reservasi tidak valid.')
});

export async function POST(request: NextRequest) {
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const { bookingId } = requestSchema.parse(body);
    const currentBooking = await booking(user.id, bookingId);

    if (currentBooking.status !== 'PENDING_PAYMENT') {
      return NextResponse.json(
        {
          error:
            currentBooking.status === 'CONFIRMED'
              ? 'Reservasi ini sudah lunas.'
              : 'Reservasi ini sudah kedaluwarsa atau dibatalkan.'
        },
        { status: 409 }
      );
    }

    const snapResult = await createMidtransSnapTransaction(currentBooking, {
      name: user.email ? user.email.split('@')[0] : 'Pengunjung',
      email: user.email || 'pengunjung@summapass.id'
    });

    return NextResponse.json({
      success: true,
      token: snapResult.token,
      redirectUrl: snapResult.redirectUrl
    });
  } catch (error) {
    return failure(error);
  }
}
