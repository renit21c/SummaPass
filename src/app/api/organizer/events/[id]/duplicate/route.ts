import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { duplicateEvent } from '@/features/catalog/service';
import { failure } from '@/features/booking/http';

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    const event = await duplicateEvent(id);
    return NextResponse.json({ ...event, event }, { status: 201 });
  } catch (e) {
    return failure(e);
  }
}
