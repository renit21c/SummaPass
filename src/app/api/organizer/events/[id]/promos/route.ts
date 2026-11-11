import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { getPromosByEvent, createPromo, updatePromo, deletePromo } from '@/features/promos/service';
import { promoInputSchema } from '@/features/promos/core';
import { managedEvent } from '@/features/catalog/service';

export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = r.headers.get('origin');
  if (origin && !sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    await managedEvent(id);
    const promos = getPromosByEvent(id);
    return NextResponse.json({ promos }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    await managedEvent(id);
    const body = await r.json();
    const created = createPromo(id, body);
    return NextResponse.json({ promo: created }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    await managedEvent(id);
    const body = await r.json();
    const promoId = z.string().min(1).max(100).parse(body.id);
    const current = getPromosByEvent(id).find(p => p.id === promoId);
    if (!current) return NextResponse.json({ error: 'Promo tidak ditemukan.' }, { status: 404 });
    const updated = updatePromo(promoId, Object.keys(body).every(key => key === 'id' || key === 'status')
      ? { status: z.enum(['ACTIVE', 'INACTIVE']).parse(body.status) }
      : promoInputSchema.parse({ ...current, ...body }));
    if (!updated) return NextResponse.json({ error: 'Promo tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ promo: updated }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
    await managedEvent(id);
    const promoId = r.nextUrl.searchParams.get('promoId');
    if (!promoId) return NextResponse.json({ error: 'Parameter promoId diperlukan.' }, { status: 400 });
    if (!getPromosByEvent(id).some(p => p.id === promoId)) return NextResponse.json({ error: 'Promo tidak ditemukan.' }, { status: 404 });
    const ok = deletePromo(promoId);
    return NextResponse.json({ success: ok }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}
