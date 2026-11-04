import { NextRequest, NextResponse } from 'next/server';
import { endSession } from '@/lib/auth/session';
import { sameOrigin, requestOrigin } from '@/lib/auth/request';
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  await endSession();
  return NextResponse.redirect(new URL('/', requestOrigin(request)), 303);
}
