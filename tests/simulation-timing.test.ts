import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BuyerResult } from '../src/features/booking/concurrency';
import { compareSimulationTiming, formatSimulationMs } from '../src/features/booking/simulation-timing';

const buyer = (start: number, end: number): BuyerResult => ({ buyerName: 'Test', status: 'WINNER', httpStatus: 201, message: 'OK', timestampOffsetMs: start, completedOffsetMs: end, durationMs: end - start });

test('compares launch and finish gaps without inferring a winner from response speed', () => {
  const winner = buyer(0, 100);
  const rejected = { ...buyer(0.5, 40), status: 'REJECTED' as const, httpStatus: 409 };
  assert.deepEqual(compareSimulationTiming(winner, rejected), { startGapMs: 0.5, finishGapMs: 60, overlapMs: 39.5, scaleMs: 100 });
  assert.equal(winner.status, 'WINNER');
});

test('zero-duration and disjoint intervals keep a finite timeline and zero overlap', () => {
  assert.deepEqual(compareSimulationTiming(buyer(0, 0), buyer(0, 0)), { startGapMs: 0, finishGapMs: 0, overlapMs: 0, scaleMs: 1 });
  assert.equal(compareSimulationTiming(buyer(0, 10), buyer(20, 30)).overlapMs, 0);
  assert.equal(formatSimulationMs(1234.56), '1.234,6 ms');
});
