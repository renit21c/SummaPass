import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { getEventStaff, assignEventStaff, unassignEventStaff } from '@/features/organizer/service';

const assignInput = z.object({
  name: z.string().trim().min(1, 'Nama petugas wajib diisi.').max(100),
  userId: z.string().optional(),
});

export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = r.headers.get('origin');
  if (origin && !sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    const staff = await getEventStaff(id);
    return NextResponse.json({ staff }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    const body = assignInput.parse(await r.json());
    const assigned = await assignEventStaff(id, body.name, body.userId);
    return NextResponse.json({ assigned }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    const userId = r.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'Parameter userId diperlukan.' }, { status: 400 });
    await unassignEventStaff(id, userId);
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

