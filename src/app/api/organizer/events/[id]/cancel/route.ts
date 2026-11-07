import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { operationRpc } from '@/features/operations/service';
import { cancelInput, uuid } from '@/features/operations/contracts';
import { notificationBody, notificationFailure } from '@/features/notifications/http';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  try {
    const input = cancelInput.parse(await notificationBody(request));
    return NextResponse.json(await operationRpc('cancel_event', { p_event: uuid.parse((await params).id), p_reason: input.reason, p_key: input.key }));
  } catch (e) { return notificationFailure(e); }
}
