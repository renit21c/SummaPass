import { z } from 'zod';

export const promoTypeSchema = z.enum(['AUTOMATIC', 'VOUCHER']);
export type PromoType = z.infer<typeof promoTypeSchema>;

export const discountTypeSchema = z.enum(['PERCENT', 'NOMINAL']);
export type DiscountType = z.infer<typeof discountTypeSchema> | 'FIXED';

export const promoScopeSchema = z.enum(['ALL', 'CATEGORY']);
export type PromoScope = z.infer<typeof promoScopeSchema> | 'SPECIFIC_CATEGORY';

export const promoStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type PromoStatus = z.infer<typeof promoStatusSchema>;

export const promoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string(),
  type: promoTypeSchema,
  code: z.string().trim().max(30).optional().nullable(),
  name: z.string().trim().min(2, 'Nama promo minimal 2 karakter.').max(100),
  discountType: discountTypeSchema,
  discountValue: z.number().positive('Nilai potongan harus lebih besar dari 0.'),
  scope: promoScopeSchema,
  categoryId: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  startDate: z.string(),
  endDate: z.string(),
  quota: z.number().int().positive().nullable().optional(),
  usedCount: z.number().int().nonnegative().default(0),
  minQuantity: z.number().int().positive().nullable().optional(),
  status: promoStatusSchema.default('ACTIVE'),
  createdAt: z.string()
});

export type Promo = z.infer<typeof promoSchema>;

export const promoInputSchema = z.object({
  type: promoTypeSchema,
  code: z.string().trim().max(30).optional().nullable(),
  name: z.string().trim().min(2, 'Nama promo minimal 2 karakter.').max(100),
  discountType: discountTypeSchema,
  discountValue: z.number().positive('Nilai potongan harus lebih besar dari 0.'),
  scope: promoScopeSchema.default('ALL'),
  categoryId: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
  endDate: z.string().min(1, 'Tanggal berakhir wajib diisi.'),
  quota: z.number().int().positive().nullable().optional(),
  minQuantity: z.number().int().positive().nullable().optional(),
  status: promoStatusSchema.default('ACTIVE')
}).refine(data => {
  if (data.type === 'VOUCHER' && (!data.code || data.code.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'Kode voucher wajib diisi untuk jenis promo Voucher.',
  path: ['code']
}).refine(data => {
  if (data.discountType === 'PERCENT' && data.discountValue > 100) {
    return false;
  }
  return true;
}, {
  message: 'Potongan persentase tidak boleh lebih dari 100%.',
  path: ['discountValue']
}).refine(data => {
  const start = Date.parse(data.startDate);
  const end = Date.parse(data.endDate);
  if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
    return false;
  }
  return true;
}, {
  message: 'Tanggal berakhir harus sama atau setelah tanggal mulai.',
  path: ['endDate']
});

export type PromoInput = z.infer<typeof promoInputSchema>;

export interface PromoEvaluationContext {
  basePrice: number;
  quantity: number;
  categoryId?: string | null;
  voucherCode?: string | null;
  promos: Promo[];
  now?: number; // timestamp ms
}

export interface DiscountCalculationResult {
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  appliedPromo: Promo | null;
  appliedPromoType: PromoType | null;
  discountBreakdown: string;
  bestAutomaticPromo: Promo | null;
  matchingVoucherPromo: Promo | null;
  voucherError?: string | null;
}

/**
 * Calculates discounts based on the SummaPass promo rules:
 * - Filter active, within date range, within quota, scope matches, minQuantity matches.
 * - Chooses largest automatic discount.
 * - If voucher code provided, evaluates voucher.
 * - Does not stack: selects whichever discount gives larger savings.
 */
export function calculateApplicablePromo(
  ctxOrPromos: PromoEvaluationContext | Promo[],
  maybeOptions?: { categoryId?: string | null; quantity: number; subtotal?: number; basePrice?: number } | string,
  maybeVoucher?: string | null,
  maybeNow?: number
): DiscountCalculationResult {
  let ctx: PromoEvaluationContext;

  if (Array.isArray(ctxOrPromos)) {
    const promos = ctxOrPromos;
    const opts = (typeof maybeOptions === 'object' && maybeOptions !== null) ? maybeOptions : { quantity: 1 };
    const quantity = opts.quantity ?? 1;
    const basePrice = opts.basePrice ?? (opts.subtotal !== undefined && quantity > 0 ? opts.subtotal / quantity : 0);
    const categoryId = opts.categoryId ?? null;
    const voucherCode = (typeof maybeVoucher === 'string' ? maybeVoucher : null);
    const now = maybeNow ?? Date.now();
    ctx = { promos, quantity, basePrice, categoryId, voucherCode, now };
  } else {
    ctx = ctxOrPromos;
  }

  const {
    basePrice,
    quantity,
    categoryId,
    voucherCode,
    promos = [],
    now = Date.now()
  } = ctx;

  const originalTotal = Math.max(0, basePrice * quantity);
  if (originalTotal === 0 || quantity <= 0) {
    return {
      originalTotal: 0,
      discountAmount: 0,
      finalTotal: 0,
      appliedPromo: null,
      appliedPromoType: null,
      discountBreakdown: '',
      bestAutomaticPromo: null,
      matchingVoucherPromo: null
    };
  }

  // Filter valid promos
  function isPromoEligible(p: Promo, isVoucherCheck = false): { eligible: boolean; reason?: string } {
    if (p.status && p.status !== 'ACTIVE') return { eligible: false, reason: 'Promo tidak aktif.' };
    if ((p as any).active === false) return { eligible: false, reason: 'Promo tidak aktif.' };

    if (p.startDate) {
      const start = Date.parse(p.startDate);
      if (!Number.isNaN(start) && now < start) return { eligible: false, reason: 'Promo belum dimulai.' };
    }
    if (p.endDate) {
      const end = Date.parse(p.endDate);
      if (!Number.isNaN(end) && now > end) return { eligible: false, reason: 'Promo sudah berakhir.' };
    }

    if (p.quota !== null && p.quota !== undefined && (p.usedCount ?? 0) >= p.quota) {
      return { eligible: false, reason: 'Kuota promo telah habis.' };
    }

    const isCategoryScoped = p.scope === 'CATEGORY' || (p.scope as string) === 'SPECIFIC_CATEGORY';
    if (isCategoryScoped && categoryId) {
      if (p.categoryId && p.categoryId !== categoryId) {
        return { eligible: false, reason: 'Promo tidak berlaku untuk kategori tiket ini.' };
      }
      if (Array.isArray((p as any).categoryIds) && !(p as any).categoryIds.includes(categoryId)) {
        return { eligible: false, reason: 'Promo tidak berlaku untuk kategori tiket ini.' };
      }
    }

    if (p.minQuantity && quantity < p.minQuantity) {
      return { eligible: false, reason: `Minimal pembelian ${p.minQuantity} tiket untuk promo ini.` };
    }

    return { eligible: true };
  }

  function computeSavings(p: Promo): number {
    if (p.discountType === 'PERCENT') {
      const percentage = Math.min(100, Math.max(0, p.discountValue));
      return Math.round(originalTotal * (percentage / 100));
    } else {
      // Nominal / Fixed discount (flat per transaction, capped at originalTotal)
      return Math.min(originalTotal, p.discountValue);
    }
  }

  // 1. Evaluate automatic promos
  const activeAutoPromos = promos.filter(p => p.type === 'AUTOMATIC' && isPromoEligible(p).eligible);
  let bestAutoPromo: Promo | null = null;
  let bestAutoSavings = 0;

  for (const p of activeAutoPromos) {
    const savings = computeSavings(p);
    if (savings > bestAutoSavings) {
      bestAutoSavings = savings;
      bestAutoPromo = p;
    }
  }

  // 2. Evaluate voucher if provided
  let matchingVoucher: Promo | null = null;
  let voucherSavings = 0;
  let voucherError: string | null = null;

  if (voucherCode && voucherCode.trim().length > 0) {
    const normalizedInput = voucherCode.trim().toUpperCase();
    const candidate = promos.find(p => p.type === 'VOUCHER' && (p.code ?? '').trim().toUpperCase() === normalizedInput);
    if (!candidate) {
      voucherError = 'Kode voucher tidak ditemukan.';
    } else {
      const eligibility = isPromoEligible(candidate, true);
      if (!eligibility.eligible) {
        voucherError = eligibility.reason || 'Kode voucher tidak memenuhi syarat.';
      } else {
        matchingVoucher = candidate;
        voucherSavings = computeSavings(candidate);
      }
    }
  }

  // 3. Selection rule: Largest discount wins (no stacking by default)
  let appliedPromo: Promo | null = null;
  let discountAmount = 0;

  if (matchingVoucher && voucherSavings > bestAutoSavings) {
    appliedPromo = matchingVoucher;
    discountAmount = voucherSavings;
  } else if (bestAutoPromo && bestAutoSavings > 0) {
    appliedPromo = bestAutoPromo;
    discountAmount = bestAutoSavings;
  }

  // Cap discount at originalTotal
  discountAmount = Math.min(originalTotal, Math.max(0, discountAmount));
  const finalTotal = Math.max(0, originalTotal - discountAmount);

  let discountBreakdown = '';
  if (appliedPromo) {
    if (appliedPromo.discountType === 'PERCENT') {
      discountBreakdown = `Diskon ${appliedPromo.discountValue}% (${appliedPromo.name})`;
    } else {
      discountBreakdown = `Potongan Rp${appliedPromo.discountValue.toLocaleString('id-ID')} (${appliedPromo.name})`;
    }
  }

  return {
    originalTotal,
    discountAmount,
    finalTotal,
    appliedPromo,
    appliedPromoType: appliedPromo?.type ?? null,
    discountBreakdown,
    bestAutomaticPromo: bestAutoPromo,
    matchingVoucherPromo: matchingVoucher,
    voucherError
  };
}
