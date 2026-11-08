import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConcurrencySimulation } from '../src/features/booking/concurrency';
import { BookingError } from '../src/features/booking/types';
import { DemoBookingStore } from '../src/features/booking/demo-store';

function createMockDeps(store: DemoBookingStore) {
  return {
    inventory: async (slug: string) => store.inventory(slug),
    reserve: async (userId: string, input: any) => store.reserve(userId, input),
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
  assert.ok(loser.message.includes('sudah tidak tersedia') || loser.message.includes('dikunci oleh pembeli lain'));

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
