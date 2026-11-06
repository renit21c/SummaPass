import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { catalogDb, actors, asUser } from './helpers/catalog-db';
import { createTicketPack } from '../src/features/tickets/crypto';

test('Tahap 2 Orang 4: demo check-in correction resets ticket status and creates audit log', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));

  // Reserve and pay for a ticket on little-weekend
  const b = store.reserve('buyer1', {
    slug: 'little-weekend',
    categoryId: 'regular',
    seats: [{ seatId: 'Regular-A1', name: 'Peserta Koreksi' }],
    key: randomUUID(),
  });
  store.payment('buyer1', b.id, 'success');
  const ticket = store.ticketsFor('buyer1')[0];

  // 1. Check in the ticket
  const checkInRes = store.checkIn('staff1', 'little-weekend', ticket.token, true);
  assert.equal(checkInRes.status, 'CHECKED_IN');

  const reportAfterCheckIn = store.staffReport('staff1', 'little-weekend');
  assert.equal(reportAfterCheckIn.totalCheckedInByMe, 1);
  assert.equal(reportAfterCheckIn.totalEventCheckedIn, 1);
  assert.equal(reportAfterCheckIn.history.length, 1);
  assert.equal(reportAfterCheckIn.audits?.length, 0);

  // Verifying scanning again without confirm reports ALREADY_USED
  const previewUsed = store.checkIn('staff1', 'little-weekend', ticket.reference, false);
  assert.equal(previewUsed.status, 'ALREADY_USED');

  // 2. Perform check-in correction (revert)
  const revertRes = store.revertCheckIn('staff1', 'little-weekend', ticket.id, 'Salah scan tiket pengunjung');
  assert.equal(revertRes.status, 'REVERTED');
  assert.equal(revertRes.ticket?.id, ticket.id);
  assert.equal(revertRes.audit.action, 'REVERT_CHECK_IN');
  assert.equal(revertRes.audit.reason, 'Salah scan tiket pengunjung');
  assert.equal(revertRes.audit.performedBy, 'staff1');
  assert.ok(revertRes.audit.previousCheckedInAt);

  // 3. Ticket is valid again!
  const previewValidAgain = store.checkIn('staff1', 'little-weekend', ticket.reference, false);
  assert.equal(previewValidAgain.status, 'VALID');

  // 4. Report statistics are decremented and audits are populated
  const reportAfterRevert = store.staffReport('staff1', 'little-weekend');
  assert.equal(reportAfterRevert.totalCheckedInByMe, 0);
  assert.equal(reportAfterRevert.totalEventCheckedIn, 0);
  assert.equal(reportAfterRevert.history.length, 0);
  assert.equal(reportAfterRevert.audits?.length, 1);
  assert.equal(reportAfterRevert.audits[0].reason, 'Salah scan tiket pengunjung');

  // 5. Audits can be retrieved via getCheckInAudits
  const audits = store.getCheckInAudits('staff1', 'little-weekend');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].ticketId, ticket.id);
  assert.equal(audits[0].attendeeName, 'Peserta Koreksi');

  // 6. Can check in the ticket again cleanly
  const secondCheckIn = store.checkIn('staff1', 'little-weekend', ticket.token, true);
  assert.equal(secondCheckIn.status, 'CHECKED_IN');
  const reportRechecked = store.staffReport('staff1', 'little-weekend');
  assert.equal(reportRechecked.totalCheckedInByMe, 1);
  assert.equal(reportRechecked.totalEventCheckedIn, 1);
  assert.equal(reportRechecked.history.length, 1);
  assert.equal(reportRechecked.audits?.length, 1);
});

test('Tahap 2 Orang 4: demo check-in correction validates permissions, reason, and state', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));

  const b = store.reserve('buyer1', {
    slug: 'little-weekend',
    categoryId: 'regular',
    seats: [{ seatId: 'Regular-A2', name: 'Peserta Uji Validasi' }],
    key: randomUUID(),
  });
  store.payment('buyer1', b.id, 'success');
  const ticket = store.ticketsFor('buyer1')[0];

  // Cannot revert ticket that has not been checked in yet
  assert.throws(
    () => store.revertCheckIn('staff1', 'little-weekend', ticket.id, 'Belum masuk'),
    /belum pernah di-check-in/
  );

  // Check in the ticket
  store.checkIn('staff1', 'little-weekend', ticket.token, true);

  // Unassigned staff cannot revert
  assert.throws(
    () => store.revertCheckIn('unassigned-staff', 'after-hours', ticket.id, 'Salah scan'),
    /tidak ditugaskan/
  );

  // Reason too short (< 3 chars)
  assert.throws(
    () => store.revertCheckIn('staff1', 'little-weekend', ticket.id, 'ab'),
    /minimal 3 karakter/
  );

  // Non-existent ticket
  assert.throws(
    () => store.revertCheckIn('staff1', 'little-weekend', randomUUID(), 'Salah scan'),
    /Tiket tidak ditemukan/
  );
});

test('Tahap 2 Orang 4: check-in audit persistence survives store restart', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));
  const b = store.reserve('buyer1', {
    slug: 'little-weekend',
    categoryId: 'regular',
    seats: [{ seatId: 'Regular-A3', name: 'Peserta Restart Audit' }],
    key: randomUUID(),
  });
  store.payment('buyer1', b.id, 'success');
  const ticket = store.ticketsFor('buyer1')[0];

  store.checkIn('staff1', 'little-weekend', ticket.token, true);
  store.revertCheckIn('staff1', 'little-weekend', ticket.id, 'Koreksi sebelum restart');

  const audits = store.getAllCheckInAudits();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].reason, 'Koreksi sebelum restart');

  // Restart store with persisted audits
  const restartedStore = new DemoBookingStore(undefined, undefined, undefined, undefined, audits);
  const restoredAudits = restartedStore.getCheckInAudits('staff1', 'little-weekend');
  assert.equal(restoredAudits.length, 1);
  assert.equal(restoredAudits[0].reason, 'Koreksi sebelum restart');
  assert.equal(restoredAudits[0].attendeeName, 'Peserta Restart Audit');

  const report = restartedStore.staffReport('staff1', 'little-weekend');
  assert.equal(report.audits?.length, 1);
  assert.equal(report.audits[0].reason, 'Koreksi sebelum restart');
});

test('Tahap 2 Orang 4: PostgreSQL revert_check_in RPC and check_in_audits enforce staff access and transactional audit', async () => {
  const db = await catalogDb();
  try {
    const slug = 'little-weekend';
    const littleWeekendEventId = '20000000-0000-4000-8000-000000000003';
    // Grant staff access to little-weekend
    await db.exec(`insert into public.event_access(event_id, user_id, role) values('${littleWeekendEventId}', '${actors.staff}', 'STAFF') on conflict do nothing;`);

    const category = (
      await db.query<{ id: string }>(
        `select c.id from public.ticket_categories c join public.events e on e.id=c.event_id where e.slug=$1 and c.name='Regular'`,
        [slug]
      )
    ).rows[0].id;
    const seat = (
      await db.query<{ id: string }>(
        `select s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.name='Regular' order by s.row_label,s.number limit 1`
      )
    ).rows[0].id;

    await asUser(db, actors.buyer);
    const b = (
      await db.query<{ r: { id: string } }>(
        `select public.reserve_booking($1,$2,$3::jsonb,$4) as r`,
        [slug, category, JSON.stringify([{ seatId: seat, name: 'Peserta SQL Audit' }]), randomUUID()]
      )
    ).rows[0].r;

    const pack = createTicketPack(seat, randomBytes(32));
    await db.exec('reset role;set role service_role');
    await db.query(`select public.process_simulated_payment($1,$2,'success',$3::jsonb)`, [
      actors.buyer,
      b.id,
      JSON.stringify([pack]),
    ]);

    // Check in ticket as staff
    await asUser(db, actors.staff);
    const checkInRes = (
      await db.query<{ r: { status: string } }>(
        `select public.validate_check_in($1,null,$2,true) as r`,
        [slug, pack.tokenHash]
      )
    ).rows[0].r;
    assert.equal(checkInRes.status, 'CHECKED_IN');

    // Unassigned user cannot revert
    await asUser(db, actors.other);
    const forbiddenRes = (
      await db.query<{ r: { error: string } }>(
        `select public.revert_check_in($1,$2,$3) as r`,
        [slug, pack.ticketId, 'Salah scan']
      )
    ).rows[0].r;
    assert.equal(forbiddenRes.error, 'FORBIDDEN');

    // Staff reverts check-in with invalid short reason
    await asUser(db, actors.staff);
    const invalidReasonRes = (
      await db.query<{ r: { error: string } }>(
        `select public.revert_check_in($1,$2,$3) as r`,
        [slug, pack.ticketId, 'no']
      )
    ).rows[0].r;
    assert.equal(invalidReasonRes.error, 'INVALID_REASON');

    // Staff reverts check-in successfully with valid reason
    const revertRes = (
      await db.query<{ r: { status: string; ticketId: string; reason: string } }>(
        `select public.revert_check_in($1,$2,$3) as r`,
        [slug, pack.ticketId, 'Peserta izin keluar beli minum']
      )
    ).rows[0].r;
    assert.equal(revertRes.status, 'REVERTED');
    assert.equal(revertRes.reason, 'Peserta izin keluar beli minum');

    // Verify check_ins table no longer has this ticket
    const checkInsCount = (
      await db.query<{ count: string }>(`select count(*) from public.check_ins where ticket_id=$1`, [pack.ticketId])
    ).rows[0];
    assert.equal(Number(checkInsCount.count), 0);

    // Verify ticket can now be checked in again
    const revalidateRes = (
      await db.query<{ r: { status: string } }>(
        `select public.validate_check_in($1,null,$2,false) as r`,
        [slug, pack.tokenHash]
      )
    ).rows[0].r;
    assert.equal(revalidateRes.status, 'VALID');

    // Query audit log via check_in_audits function
    const audits = (
      await db.query<{ r: Array<{ ticketId: string; reason: string; action: string; performedBy: string }> }>(
        `select public.check_in_audits($1) as r`,
        [slug]
      )
    ).rows[0].r;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].ticketId, pack.ticketId);
    assert.equal(audits[0].action, 'REVERT_CHECK_IN');
    assert.equal(audits[0].reason, 'Peserta izin keluar beli minum');
    assert.equal(audits[0].performedBy, actors.staff);
  } finally {
    await db.close();
  }
});
