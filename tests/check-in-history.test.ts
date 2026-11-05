import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { saveCheckIns, loadCheckIns, type PersistedCheckIn } from '../src/features/check-in/persistence';

test('staff report calculates individual staff metrics and attendance rate accurately', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));

  // Should throw for unassigned event
  assert.throws(() => store.staffReport('staff1', 'after-hours'), /tidak ditugaskan/);

  // Reserve and pay for 2 tickets on little-weekend
  const b = store.reserve('buyer1', {
    slug: 'little-weekend',
    categoryId: 'regular',
    seats: [
      { seatId: 'Regular-A1', name: 'Peserta Satu' },
      { seatId: 'Regular-A2', name: 'Peserta Dua' },
    ],
    key: randomUUID(),
  });
  store.payment('buyer1', b.id, 'success');
  const [ticket1, ticket2] = store.ticketsFor('buyer1');

  // Before check-in
  const initialReport = store.staffReport('staff1', 'little-weekend');
  assert.equal(initialReport.totalCheckedInByMe, 0);
  assert.equal(initialReport.totalEventCheckedIn, 0);
  assert.equal(initialReport.history.length, 0);

  // Staff 1 checks in ticket 1
  store.checkIn('staff1', 'little-weekend', ticket1.token, true);

  const reportAfterStaff1 = store.staffReport('staff1', 'little-weekend');
  assert.equal(reportAfterStaff1.totalCheckedInByMe, 1);
  assert.equal(reportAfterStaff1.totalEventCheckedIn, 1);
  assert.equal(reportAfterStaff1.history.length, 1);
  assert.equal(reportAfterStaff1.history[0].attendeeName, 'Peserta Satu');
  assert.equal(reportAfterStaff1.history[0].isMe, true);

  // Staff 2 views the report
  const reportStaff2 = store.staffReport('staff2', 'little-weekend');
  assert.equal(reportStaff2.totalCheckedInByMe, 0);
  assert.equal(reportStaff2.totalEventCheckedIn, 1);
  assert.equal(reportStaff2.history[0].isMe, false);

  // Staff 2 checks in ticket 2
  store.checkIn('staff2', 'little-weekend', ticket2.token, true);

  const finalReportStaff1 = store.staffReport('staff1', 'little-weekend');
  assert.equal(finalReportStaff1.totalCheckedInByMe, 1);
  assert.equal(finalReportStaff1.totalEventCheckedIn, 2);
  assert.equal(finalReportStaff1.history.length, 2);

  const finalReportStaff2 = store.staffReport('staff2', 'little-weekend');
  assert.equal(finalReportStaff2.totalCheckedInByMe, 1);
  assert.equal(finalReportStaff2.totalEventCheckedIn, 2);
});

test('check-in history persistence survives store re-initialization (restart)', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T12:00:00Z'));
  const b = store.reserve('buyer', {
    slug: 'little-weekend',
    categoryId: 'regular',
    seats: [{ seatId: 'Regular-A3', name: 'Peserta Restart' }],
    key: randomUUID(),
  });
  store.payment('buyer', b.id, 'success');
  const t = store.ticketsFor('buyer')[0];

  store.checkIn('staff-alpha', 'little-weekend', t.token, true);
  const checkIns = store.getCheckIns();
  assert.equal(checkIns.length, 1);
  assert.equal(checkIns[0].attendeeName, 'Peserta Restart');

  // Simulate store re-initialization with restored check-ins
  const restartedStore = new DemoBookingStore(undefined, undefined, checkIns);
  const report = restartedStore.staffReport('staff-alpha', 'little-weekend');
  assert.equal(report.totalCheckedInByMe, 1);
  assert.equal(report.totalEventCheckedIn, 1);
  assert.equal(report.history[0].attendeeName, 'Peserta Restart');
  assert.equal(report.history[0].staffId, 'staff-alpha');
});

