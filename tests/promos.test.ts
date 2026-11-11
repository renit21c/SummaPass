import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateApplicablePromo, type Promo } from '../src/features/promos/core';

test('promos engine: applies percentage discount correctly', () => {
  const promo: Promo = {
    id: '11111111-1111-4111-8111-111111111111',
    eventId: 'event-1',
    name: 'Early Bird',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 20,
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const result = calculateApplicablePromo([promo], {
    categoryId: 'cat-reg',
    quantity: 1,
    subtotal: 150000,
  });

  assert.equal(result.discountAmount, 30000);
  assert.equal(result.finalTotal, 120000);
  assert.equal(result.appliedPromo?.name, 'Early Bird');
});

test('promos engine: applies nominal/fixed discount correctly', () => {
  const promo: Promo = {
    id: '22222222-2222-4222-8222-222222222222',
    eventId: 'event-1',
    name: 'Potongan Rp25.000',
    type: 'AUTOMATIC',
    discountType: 'NOMINAL',
    discountValue: 25000,
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const result = calculateApplicablePromo([promo], {
    categoryId: 'cat-vip',
    quantity: 1,
    subtotal: 200000,
  });

  assert.equal(result.discountAmount, 25000);
  assert.equal(result.finalTotal, 175000);
});

test('promos engine: selects the largest discount when multiple automatic promos apply', () => {
  const promoA: Promo = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventId: 'event-1',
    name: 'Diskon 10%',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 10, // 10% of 200.000 = 20.000
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const promoB: Promo = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    eventId: 'event-1',
    name: 'Potongan Rp35.000',
    type: 'AUTOMATIC',
    discountType: 'NOMINAL',
    discountValue: 35000, // 35.000 (Larger than 20.000)
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const result = calculateApplicablePromo([promoA, promoB], {
    categoryId: 'cat-reg',
    quantity: 1,
    subtotal: 200000,
  });

  assert.equal(result.discountAmount, 35000);
  assert.equal(result.appliedPromo?.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

test('promos engine: non-stacking rule selects greater deduction between automatic promo and voucher', () => {
  const autoPromo: Promo = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    eventId: 'event-1',
    name: 'Early Bird 15%',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 15, // 15% of 100.000 = 15.000
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const voucherPromo: Promo = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    eventId: 'event-1',
    name: 'Voucher Spesial 25.000',
    type: 'VOUCHER',
    code: 'HEMAT25',
    discountType: 'NOMINAL',
    discountValue: 25000, // 25.000 > 15.000
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  // When voucher offers larger discount, voucher is selected
  const voucherWins = calculateApplicablePromo(
    [autoPromo, voucherPromo],
    { categoryId: 'cat-reg', quantity: 1, subtotal: 100000 },
    'HEMAT25'
  );
  assert.equal(voucherWins.discountAmount, 25000);
  assert.equal(voucherWins.appliedPromo?.code, 'HEMAT25');

  // When subtotal is 300.000, 15% = 45.000 > 25.000 voucher, auto promo wins
  const autoWins = calculateApplicablePromo(
    [autoPromo, voucherPromo],
    { categoryId: 'cat-reg', quantity: 3, subtotal: 300000 },
    'HEMAT25'
  );
  assert.equal(autoWins.discountAmount, 45000);
  assert.equal(autoWins.appliedPromo?.id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
});

test('promos engine: enforces minimum quantity threshold', () => {
  const bulkPromo: Promo = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    eventId: 'event-1',
    name: 'Beli 3 Diskon 15%',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 15,
    minQuantity: 3,
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  // 2 tickets: does not qualify
  const fail = calculateApplicablePromo([bulkPromo], {
    categoryId: 'cat-reg',
    quantity: 2,
    subtotal: 200000,
  });
  assert.equal(fail.discountAmount, 0);

  // 3 tickets: qualifies!
  const pass = calculateApplicablePromo([bulkPromo], {
    categoryId: 'cat-reg',
    quantity: 3,
    subtotal: 300000,
  });
  assert.equal(pass.discountAmount, 45000);
  assert.equal(pass.finalTotal, 255000);
});

test('promos engine: enforces category scope', () => {
  const vipOnlyPromo: Promo = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    eventId: 'event-1',
    name: 'Promo VIP 50K',
    type: 'AUTOMATIC',
    discountType: 'NOMINAL',
    discountValue: 50000,
    scope: 'CATEGORY',
    categoryId: 'vip-1',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const regResult = calculateApplicablePromo([vipOnlyPromo], {
    categoryId: 'reg-1',
    quantity: 1,
    subtotal: 100000,
  });
  assert.equal(regResult.discountAmount, 0);

  const vipResult = calculateApplicablePromo([vipOnlyPromo], {
    categoryId: 'vip-1',
    quantity: 1,
    subtotal: 250000,
  });
  assert.equal(vipResult.discountAmount, 50000);
});

test('promos engine: respects quota and dates', () => {
  const exhaustedPromo: Promo = {
    id: '88888888-8888-4888-8888-888888888888',
    eventId: 'event-1',
    name: 'Promo Terbatas',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 50,
    quota: 10,
    usedCount: 10, // Quota reached
    scope: 'ALL',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-12-31T23:59:59Z',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const res = calculateApplicablePromo([exhaustedPromo], {
    categoryId: 'reg-1',
    quantity: 1,
    subtotal: 100000,
  });
  assert.equal(res.discountAmount, 0);

  const expiredPromo: Promo = {
    id: '99999999-9999-4999-8999-999999999999',
    eventId: 'event-1',
    name: 'Promo Kemarin',
    type: 'AUTOMATIC',
    discountType: 'PERCENT',
    discountValue: 20,
    scope: 'ALL',
    startDate: '2020-01-01T00:00:00Z',
    endDate: '2020-01-02T00:00:00Z',
    usedCount: 0,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };

  const resExpired = calculateApplicablePromo([expiredPromo], {
    categoryId: 'reg-1',
    quantity: 1,
    subtotal: 100000,
  });
  assert.equal(resExpired.discountAmount, 0);
});
