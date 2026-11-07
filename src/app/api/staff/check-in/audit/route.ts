import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { checkInAudits } from '@/features/check-in/service';

export async function GET(r: NextRequest) {
  const origin = r.headers.get('origin');
  if (origin && !sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const slug = r.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'Parameter slug diperlukan.' }, { status: 400 });
    const audits = await checkInAudits(slug);
    return NextResponse.json({ audits }, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return failure(e);
  }
}

