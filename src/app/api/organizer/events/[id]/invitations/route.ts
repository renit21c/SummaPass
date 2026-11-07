import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { operationRpc } from '@/features/operations/service';
import { inviteInput, uuid } from '@/features/operations/contracts';
import { notificationBody, notificationFailure } from '@/features/notifications/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  try { return NextResponse.json(await operationRpc('event_staff_invitations', { p_event: uuid.parse((await params).id) }), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (e) { return notificationFailure(e); }
}
export async function POST(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  try {
    const input = inviteInput.parse(await notificationBody(request));
    return NextResponse.json(await operationRpc('invite_event_staff', { p_event: uuid.parse((await params).id), p_email: input.email, p_key: input.key }));
  } catch (e) { return notificationFailure(e); }
}
