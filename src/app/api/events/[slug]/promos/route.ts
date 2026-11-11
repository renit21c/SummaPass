import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { inventory } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
import { getPromosByEvent } from '@/features/promos/service';
import { calculateApplicablePromo } from '@/features/promos/core';

const calculateRequestSchema = z.object({
  categoryId: z.string(),
  quantity: z.number().int().min(1).max(6),
  basePrice: z.number().nonnegative().optional(),
  subtotal: z.number().nonnegative().optional(),
  voucherCode: z.string().optional().nullable()
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const inv = await inventory(slug);
    const allPromos = getPromosByEvent(inv.eventId);
    const now = Date.now();

    // Filter public active promos
    const activePromos = allPromos.filter(p => {
      if (p.status !== 'ACTIVE') return false;
      const start = Date.parse(p.startDate);
      const end = Date.parse(p.endDate);
      if (!Number.isNaN(start) && now < start) return false;
      if (!Number.isNaN(end) && now > end) return false;
      if (p.quota !== null && p.quota !== undefined && p.usedCount >= p.quota) return false;
      return true;
    });

    return NextResponse.json({
      promos: activePromos.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        discountType: p.discountType,
        discountValue: p.discountValue,
        scope: p.scope,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        minQuantity: p.minQuantity,
        startDate: p.startDate,
        endDate: p.endDate
      }))
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const inv = await inventory(slug);
    const body = calculateRequestSchema.parse(await request.json());
    const allPromos = getPromosByEvent(inv.eventId);
    const basePrice = body.basePrice ?? (body.subtotal !== undefined ? body.subtotal / body.quantity : 0);

    const calculation = calculateApplicablePromo({
      basePrice,
      quantity: body.quantity,
      categoryId: body.categoryId,
      voucherCode: body.voucherCode,
      promos: allPromos,
      now: Date.now()
    });

    return NextResponse.json(calculation, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return failure(error);
  }
}
