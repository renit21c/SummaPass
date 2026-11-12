import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConcurrencySimulation, type ConcurrencyDependencies } from '../src/features/booking/concurrency';
import { BookingError, type Booking, type ReserveInput } from '../src/features/booking/types';
import { DemoBookingStore } from '../src/features/booking/demo-store';

function createMockDeps(store: DemoBookingStore) {
  return {
    inventory: async (slug: string) => store.inventory(slug),
    reserve: async (userId: string, input: any) => input.packageId ? store.reservePackage(userId, input) : store.reserve(userId, input),
    cancel: async (userId: string, id: string) => store.cancel(userId, id),
  };
}

test('concurrency simulation produces exactly 1 winner and 1 rejected buyer with auto-release', async () => {
  const store = new DemoBookingStore();
  const deps = createMockDeps(store);

  const result = await runConcurrencySimulation(
    'test-user-concurrency-1',
    {
      slug: 'little-weekend',
      categoryId: 'regular',
      seatId: 'Regular-B5',
      seatLabel: 'Regular B5',
      autoRelease: true,
    },
    deps
  );

  assert.equal(result.seatId, 'Regular-B5');
  assert.equal(result.winnerCount, 1, 'Harus tepat 1 pemenang');
  assert.equal(result.rejectedCount, 1, 'Harus tepat 1 penolakan');
  assert.equal(result.autoReleased, true, 'Reservasi pemenang harus dilepas otomatis');
  assert.equal(result.technicalAudit.doubleBookingDetected, false, 'Tidak boleh ada kursi ganda');

  // Verify that either buyerA or buyerB is the winner, and the other is rejected
  const winner = result.buyerA.status === 'WINNER' ? result.buyerA : result.buyerB;
  const loser = result.buyerA.status === 'REJECTED' ? result.buyerA : result.buyerB;

  assert.equal(winner.status, 'WINNER');
  assert.equal(winner.httpStatus, 201);
  assert.ok(winner.bookingReference?.startsWith('SP-'));

  assert.equal(loser.status, 'REJECTED');
  assert.equal(loser.httpStatus, 409);
  assert.equal(loser.error, 'SEAT_UNAVAILABLE');
  assert.equal(result.outcome, 'PASSED');

  // Seat should be back to AVAILABLE because autoRelease is true
  const seatAfter = store.inventory('little-weekend').seats.find(s => s.id === 'Regular-B5');
  assert.equal(seatAfter?.status, 'AVAILABLE');
});

test('concurrency simulation rejects testing on already occupied seats', async () => {
  const store = new DemoBookingStore();
  const deps = createMockDeps(store);

  // Seat Front-A1 is sold by default in demo data
  await assert.rejects(
    async () => {
      await runConcurrencySimulation(
        'test-user-concurrency-2',
        {
          slug: 'little-weekend',
          categoryId: 'front',
          seatId: 'Front-A1',
          autoRelease: true,
        },
        deps
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof BookingError);
      assert.equal(err.code, 'SEAT_NOT_AVAILABLE_FOR_TEST');
      assert.equal(err.status, 409);
      return true;
    }
  );
});

const simulationInput = { slug: 'little-weekend', categoryId: 'regular', seatId: 'Regular-B5', autoRelease: true };
function fixture(participants = 1) {
  const inventory = new DemoBookingStore().inventory('little-weekend');
  const category = inventory.categories.find(c => c.id === 'regular')!;
  category.packages = [{ id: '10000000-0000-4000-8000-000000000001', name: participants === 1 ? 'Single' : 'Group', participants, price: 150000, active: true, quota: null }];
  const inputs: ReserveInput[] = [];
  const cancelled: string[] = [];
  const booking = (input: ReserveInput, n: number): Booking => ({ id: `booking-${n}`, reference: `SP-TEST-${n}`, slug: input.slug, userId: 'test-user', categoryId: input.categoryId, categoryName: 'Regular', status: 'PENDING_PAYMENT', expiresAt: new Date(Date.now() + 600000).toISOString(), total: 150000, items: [] });
  const deps: ConcurrencyDependencies = {
    inventory: async () => structuredClone(inventory),
    reserve: async (_user, input) => {
      inputs.push(input);
      if (inputs.length > 1) throw new BookingError('SEAT_UNAVAILABLE', 'Sudah dipesan.');
      return booking(input, inputs.length);
    },
    cancel: async (_user, id) => { cancelled.push(id); return { ...booking(inputs[0], 1), id, status: 'CANCELLED' }; },
  };
  return { inventory, inputs, cancelled, deps, booking };
}

for (const participants of [1, 2, 4]) test(`simulation submits a complete ${participants}-participant package and releases its reservation`, async () => {
  const f = fixture(participants);
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.outcome, 'PASSED');
  assert.equal(r.participantCount, participants);
  assert.equal(f.inputs.length, 2);
  for (const request of f.inputs) {
    assert.equal(request.packageId, f.inventory.categories.find(c => c.id === 'regular')!.packages![0].id);
    assert.equal(request.packageQuantity, 1);
    assert.equal(request.seats.length, participants);
    assert.equal(new Set(request.seats.map(s => s.seatId)).size, participants);
    assert.equal(request.seats[0].seatId, simulationInput.seatId);
  }
  assert.notEqual(f.inputs[0].key, f.inputs[1].key);
  assert.deepEqual(f.inputs[0].seats.map(s => s.seatId), f.inputs[1].seats.map(s => s.seatId));
  assert.deepEqual(f.cancelled, ['booking-1']);
});

test('both reservation calls are in flight before either resolves', async () => {
  const store = new DemoBookingStore();
  const deps = createMockDeps(store);
  let entered = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const r = await runConcurrencySimulation('test-user', simulationInput, {
    ...deps,
    reserve: async (user, input) => { if (++entered === 2) release(); await gate; return deps.reserve(user, input); },
  });
  assert.equal(entered, 2);
  assert.equal(r.outcome, 'PASSED');
  assert.equal(r.autoReleased, true);
});

test('a package from another category is rejected before making reservations', async () => {
  const f = fixture();
  await assert.rejects(runConcurrencySimulation('test-user', { ...simulationInput, packageId: '20000000-0000-4000-8000-000000000002' }, f.deps), (e: unknown) => e instanceof BookingError && e.code === 'PACKAGE');
  assert.equal(f.inputs.length, 0);
});

test('category mismatch and insufficient group capacity fail before reserving', async () => {
  const f = fixture(4);
  await assert.rejects(runConcurrencySimulation('test-user', { ...simulationInput, categoryId: 'front' }, f.deps), (e: unknown) => e instanceof BookingError && e.code === 'CATEGORY');
  f.inventory.categories.find(c => c.id === 'regular')!.remaining = 2;
  await assert.rejects(runConcurrencySimulation('test-user', simulationInput, f.deps), (e: unknown) => e instanceof BookingError && e.code === 'QUOTA');
  assert.equal(f.inputs.length, 0);
});

test('system errors and closed sales are never reported as successful seat protection', async () => {
  for (const failure of [new Error('network'), new BookingError('SALES_CLOSED', 'Penjualan ditutup.')]) {
    const f = fixture();
    f.deps.reserve = async () => { throw failure; };
    const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
    assert.equal(r.outcome, 'INCONCLUSIVE');
    assert.equal(r.winnerCount, 0);
    assert.equal(r.rejectedCount, 0);
    assert.equal(r.buyerA.status, 'ERROR');
    assert.equal(r.buyerB.status, 'ERROR');
    assert.equal(r.buyerA.httpStatus, failure instanceof BookingError ? 409 : 503);
    assert.equal(f.cancelled.length, 0);
  }
});

test('one success plus a system error is inconclusive and still cleaned up', async () => {
  const f = fixture();
  f.deps.reserve = async (_user, input) => { f.inputs.push(input); if (f.inputs.length === 2) throw new Error('network'); return f.booking(input, 1); };
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.winnerCount, 1);
  assert.equal(r.autoReleased, true);
});

test('double winners are flagged and BOTH reservations are cancelled', async () => {
  const f = fixture();
  f.deps.reserve = async (_user, input) => { f.inputs.push(input); return f.booking(input, f.inputs.length); };
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.outcome, 'DOUBLE_BOOKING');
  assert.equal(r.technicalAudit.doubleBookingDetected, true);
  assert.deepEqual(f.cancelled.sort(), ['booking-1', 'booking-2']);
  assert.equal(r.autoReleased, true);
  assert.equal(r.technicalAudit.activeAllocations, 0);
});

test('failed cleanup is surfaced instead of claiming the seat is free', async () => {
  const f = fixture();
  f.deps.cancel = async () => { throw new Error('cancel failed'); };
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.autoReleased, false);
  assert.ok(r.cleanupError?.includes('Pesanan saya'));
  assert.equal(r.technicalAudit.activeAllocations, 1);
});

test('closed categories are blocked and opening the modal prefers a category still on sale', async () => {
  const { simulationInitialCategoryId } = await import('../src/features/booking/simulation-availability');
  const now = '2026-11-12T09:00:00Z';
  const categories = [
    { id: 'front', salesStart: '2026-11-01T00:00:00Z', salesEnd: '2026-11-05T00:00:00Z' },
    { id: 'regular', salesStart: '2026-11-12T00:00:00Z', salesEnd: '2026-11-15T00:00:00Z' },
  ];
  assert.equal(simulationInitialCategoryId(categories, 'front', now), 'regular');
  assert.equal(simulationInitialCategoryId(categories, 'regular', now), 'regular');
  const f = fixture();
  f.inventory.serverNow = now;
  Object.assign(f.inventory.categories.find(c => c.id === 'regular')!, { salesStart: categories[0].salesStart, salesEnd: categories[0].salesEnd });
  await assert.rejects(runConcurrencySimulation('test-user', simulationInput, f.deps), (e: unknown) => e instanceof BookingError && e.code === 'SALES_CLOSED');
  assert.equal(f.inputs.length, 0);
});

test('a quota conflict after the winner is a rejected request, not a system failure', async () => {
  const f = fixture();
  f.deps.reserve = async (_user, input) => { f.inputs.push(input); if (f.inputs.length === 2) throw new BookingError('QUOTA', 'Kuota paket tidak mencukupi.'); return f.booking(input, 1); };
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.outcome, 'PASSED');
  assert.equal(r.buyerB.status, 'REJECTED');
  assert.equal(r.buyerB.error, 'QUOTA');
  assert.equal(r.autoReleased, true);
});

test('a repeated booking response is not claimed as two distinct seat allocations', async () => {
  const f = fixture();
  f.deps.reserve = async (_user, input) => { f.inputs.push(input); return f.booking(input, 1); };
  const r = await runConcurrencySimulation('test-user', simulationInput, f.deps);
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.technicalAudit.doubleBookingDetected, false);
  assert.deepEqual(f.cancelled, ['booking-1']);
});
