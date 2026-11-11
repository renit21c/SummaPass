import 'server-only';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promoSchema, type Promo, type PromoInput, promoInputSchema } from './core';

const dataRoot = process.env.SUMMAPASS_DATA_DIR ?? join(process.cwd(), '.data');
const promosPath = join(dataRoot, 'promos.json');

// Default initial promos for popular events so the user can immediately experience the feature
const initialPromos: Promo[] = [
  {
    id: 'p-earlybird-01',
    eventId: '20000000-0000-4000-8000-000000000001',
    type: 'AUTOMATIC',
    name: 'Early Bird 20%',
    discountType: 'PERCENT',
    discountValue: 20,
    scope: 'ALL',
    categoryId: null,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2030-12-31T23:59:59Z',
    quota: 100,
    usedCount: 8,
    minQuantity: null,
    status: 'ACTIVE',
    createdAt: '2026-11-01T10:00:00Z'
  },
  {
    id: 'p-voucher-hemat30',
    eventId: '20000000-0000-4000-8000-000000000001',
    type: 'VOUCHER',
    code: 'HEMAT30K',
    name: 'Voucher Spesial Weekend',
    discountType: 'NOMINAL',
    discountValue: 30000,
    scope: 'ALL',
    categoryId: null,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2030-12-31T23:59:59Z',
    quota: 50,
    usedCount: 3,
    minQuantity: 1,
    status: 'ACTIVE',
    createdAt: '2026-11-02T10:00:00Z'
  },
  {
    id: 'p-bundle3-15',
    eventId: '20000000-0000-4000-8000-000000000001',
    type: 'AUTOMATIC',
    name: 'Diskon Beli Min 3 Tiket 15%',
    discountType: 'PERCENT',
    discountValue: 15,
    scope: 'ALL',
    categoryId: null,
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2030-12-31T23:59:59Z',
    quota: null,
    usedCount: 0,
    minQuantity: 3,
    status: 'ACTIVE',
    createdAt: '2026-11-03T10:00:00Z'
  }
];

export function loadAllPromos(): Promo[] {
  if (!existsSync(promosPath)) {
    saveAllPromos(initialPromos);
    return initialPromos;
  }
  try {
    const raw = readFileSync(promosPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(item => promoSchema.parse(item)) : [];
  } catch (err) {
    console.error('Failed to parse promos.json, falling back to initial promos', err);
    return initialPromos;
  }
}

export function saveAllPromos(items: Promo[]) {
  mkdirSync(dataRoot, { recursive: true });
  const temp = join(dataRoot, 'promos.tmp');
  writeFileSync(temp, JSON.stringify(items, null, 2), 'utf8');
  renameSync(temp, promosPath);
}

export function getPromosByEvent(eventId: string): Promo[] {
  const all = loadAllPromos();
  return all.filter(p => p.eventId === eventId);
}

export function createPromo(eventId: string, rawInput: unknown): Promo {
  const input = promoInputSchema.parse(rawInput);
  const all = loadAllPromos();

  const newPromo: Promo = {
    id: randomUUID(),
    eventId,
    type: input.type,
    code: input.code ? input.code.trim().toUpperCase() : null,
    name: input.name.trim(),
    discountType: input.discountType,
    discountValue: input.discountValue,
    scope: input.scope,
    categoryId: input.categoryId || null,
    categoryName: input.categoryName || null,
    startDate: input.startDate,
    endDate: input.endDate,
    quota: input.quota ?? null,
    usedCount: 0,
    minQuantity: input.minQuantity ?? null,
    status: input.status,
    createdAt: new Date().toISOString()
  };

  all.push(newPromo);
  saveAllPromos(all);
  return newPromo;
}

export function updatePromo(id: string, updates: Partial<PromoInput & { status: 'ACTIVE' | 'INACTIVE'; usedCount: number }>): Promo | null {
  const all = loadAllPromos();
  const index = all.findIndex(p => p.id === id);
  if (index === -1) return null;

  const current = all[index];
  const updated: Promo = {
    ...current,
    ...updates,
    code: updates.code !== undefined ? (updates.code ? updates.code.trim().toUpperCase() : null) : current.code
  };

  all[index] = updated;
  saveAllPromos(all);
  return updated;
}

export function deletePromo(id: string): boolean {
  const all = loadAllPromos();
  const next = all.filter(p => p.id !== id);
  if (next.length === all.length) return false;
  saveAllPromos(next);
  return true;
}

export function incrementPromoUsage(id: string): void {
  const all = loadAllPromos();
  const promo = all.find(p => p.id === id);
  if (promo) {
    promo.usedCount = (promo.usedCount || 0) + 1;
    saveAllPromos(all);
  }
}

