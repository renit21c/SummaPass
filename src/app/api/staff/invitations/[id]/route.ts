import { NextRequest, NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { operationRpc } from '@/features/operations/service';
import { uuid } from '@/features/operations/contracts';
import { notificationFailure } from '@/features/notifications/http';
type Context = { params: Promise<{ id: string }> };
export async function GET(_: NextRequest, { params }: Context) {
  try { return NextResponse.json(await operationRpc('staff_invitation', { p_id: uuid.parse((await params).id) }), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (e) { return notificationFailure(e); }
}
export async function POST(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
  try { return NextResponse.json(await operationRpc('accept_staff_invitation', { p_id: uuid.parse((await params).id) })); }
  catch (e) { return notificationFailure(e); }
}
