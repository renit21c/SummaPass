import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { operationRpc } from '@/features/operations/service';
import { invitationAction, uuid } from '@/features/operations/contracts';
import { notificationBody, notificationFailure } from '@/features/notifications/http';
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  try {
    const input = invitationAction.parse(await notificationBody(request));
    return NextResponse.json(await operationRpc('manage_staff_invitation', { p_id: uuid.parse((await params).id), p_action: input.action, p_key: input.key }));
  } catch (e) { return notificationFailure(e); }
}
