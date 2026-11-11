import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { getPromosByEvent, createPromo, updatePromo, deletePromo } from '@/features/promos/service';
import { promoInputSchema } from '@/features/promos/core';

export async function GET(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = r.headers.get('origin');
  if (origin && !sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id } = await params;
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
    const { id: _id } = await params;
    const body = await r.json();
    const promoId = z.string().uuid().parse(body.id);
    const updated = updatePromo(promoId, body);
    if (!updated) return NextResponse.json({ error: 'Promo tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ promo: updated }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(r)) return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  try {
    const { id: _id } = await params;
    const promoId = r.nextUrl.searchParams.get('promoId');
    if (!promoId) return NextResponse.json({ error: 'Parameter promoId diperlukan.' }, { status: 400 });
    const ok = deletePromo(promoId);
    return NextResponse.json({ success: ok }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return failure(error);
  }
}

