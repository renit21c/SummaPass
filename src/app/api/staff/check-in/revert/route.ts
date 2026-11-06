import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { revertCheckInInput } from '@/features/check-in/core';
import { revertCheckIn } from '@/features/check-in/service';

export async function POST(r: NextRequest) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const body = await r.json();
    const input = revertCheckInInput.safeParse(body);
    if (!input.success) {
      return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Data koreksi tidak valid.' }, { status: 400 });
    }
    const { slug, ticketId, reason } = input.data;
    const result = await revertCheckIn(slug, ticketId, reason);
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return failure(e);
  }
}

