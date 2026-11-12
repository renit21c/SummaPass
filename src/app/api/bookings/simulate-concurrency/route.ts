import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/auth/request';
import { requestLimit } from '@/lib/rate-limit/server';
import { failure } from '@/features/booking/http';
import { runConcurrencySimulation } from '@/features/booking/concurrency';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  }

  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Silakan masuk kembali.' }, { status: 401 });
  }

  const limited = await requestLimit(request, 'reservation', user.id);
  if (limited) return limited;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const result = await runConcurrencySimulation(user.id, body);
    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return failure(error);
  }
}

