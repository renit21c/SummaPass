import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { operationRpc } from '@/features/operations/service';
import { queueStatus, retryInput, uuid } from '@/features/operations/contracts';
import { notificationBody, notificationFailure } from '@/features/notifications/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Context) {
  try {
    return NextResponse.json(await operationRpc('notification_operations', {
      p_event: uuid.parse((await params).id), p_status: queueStatus.nullable().parse(request.nextUrl.searchParams.get('status')),
      p_cursor: uuid.nullable().parse(request.nextUrl.searchParams.get('cursor')),
      p_limit: z.coerce.number().int().min(1).max(100).parse(request.nextUrl.searchParams.get('limit') ?? 30)
    }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { return notificationFailure(e); }
}
export async function PATCH(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  try {
    const input = retryInput.parse(await notificationBody(request));
    return NextResponse.json(await operationRpc('retry_notification_email', { p_event: uuid.parse((await params).id), p_job: input.jobId, p_reason: input.reason }));
  } catch (e) { return notificationFailure(e); }
}
