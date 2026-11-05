import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { saveStaffAssignments, loadStaffAssignments, type StaffAssignment } from '../src/features/organizer/staff-persistence';
import { catalogDb, actors, asUser, newEvent } from './helpers/catalog-db';
import { BookingError } from '../src/features/booking/types';

test('organizer can view, assign, and unassign staff per event in demo mode', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));
  const event = store.catalogItems()[0];

  // Organizer views current staff for default event
  const initialStaff = store.eventStaff('org', event.id);
  assert.ok(initialStaff.length >= 1);
  assert.equal(initialStaff[0].role, 'STAFF');

  // Unauthorized organizer throws
  assert.throws(() => store.eventStaff('random-user', 'non-existent-event'), BookingError);

  // Assign a new staff member
  const newStaff = store.assignStaff('org', event.id, 'Petugas Pintu Barat');
  assert.equal(newStaff.name, 'Petugas Pintu Barat');
  assert.equal(newStaff.role, 'STAFF');

  // Verify staff list updated
  const updatedStaff = store.eventStaff('org', event.id);
  assert.ok(updatedStaff.some(s => s.userId === newStaff.userId && s.name === 'Petugas Pintu Barat'));

  // The newly assigned staff now sees this event in their assigned events
  const staffEventList = store.staffEvents(newStaff.userId);
  assert.ok(staffEventList.some(e => e.slug === event.slug));

  // Create a brand new custom event
  const customEvent = store.createEvent('org-custom', {
    ...newEvent(),
    title: 'Konser Khusus Lapangan',
    category: 'Musik' as const,
    theme: 'play' as const,
  });

  // Petugas Pintu Barat is not yet assigned to custom event
  assert.equal(store.staffEvents(newStaff.userId).some(e => e.slug === customEvent.slug), false);
  assert.throws(() => store.checkIn(newStaff.userId, customEvent.slug, 'SPT-000', false), /tidak ditugaskan/);

  // Now assign Petugas Pintu Barat to the custom event!
  store.assignStaff('org-custom', customEvent.id, 'Petugas Pintu Barat', newStaff.userId);
  assert.equal(store.staffEvents(newStaff.userId).some(e => e.slug === customEvent.slug), true);

  // Unassign staff from the custom event
  store.unassignStaff('org-custom', customEvent.id, newStaff.userId);
  assert.equal(store.staffEvents(newStaff.userId).some(e => e.slug === customEvent.slug), false);
  assert.throws(() => store.checkIn(newStaff.userId, customEvent.slug, 'SPT-000', false), /tidak ditugaskan/);
});

test('staff assignments survive store restart via persistence', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T10:00:00Z'));
  const event = store.catalogItems()[0];

  const assigned = store.assignStaff('org', event.id, 'Petugas Shift Pagi');
  const allAssignments = store.getStaffAssignments();
  assert.ok(allAssignments.some(s => s.userId === assigned.userId));

  // Reconstruct store with persisted staff assignments
  const restoredStore = new DemoBookingStore(undefined, undefined, undefined, allAssignments);
  const restoredList = restoredStore.eventStaff('org', event.id);
  assert.ok(restoredList.some(s => s.userId === assigned.userId && s.name === 'Petugas Shift Pagi'));
  assert.ok(restoredStore.staffEvents(assigned.userId).some(e => e.slug === event.slug));
});

test('PostgreSQL event_staff, assign_staff and unassign_staff RPCs enforce organizer permissions', async () => {
  const db = await catalogDb();
  try {
    const eventId = '20000000-0000-4000-8000-000000000001';

    // Attendee or unassigned user cannot view event staff
    await asUser(db, actors.buyer);
    const forbiddenRead = (await db.query<{ r: unknown[] }>(`select public.event_staff($1) as r`, [eventId])).rows[0].r;
    assert.deepEqual(forbiddenRead, []);

    // Assigned organizer views event staff
    await asUser(db, actors.organizer);
    const staffList = (await db.query<{ r: { userId: string; role: string }[] }>(`select public.event_staff($1) as r`, [eventId])).rows[0].r;
    assert.ok(staffList.length >= 1);
    assert.equal(staffList[0].role, 'STAFF');

    // Non-organizer cannot assign staff
    await asUser(db, actors.buyer);
    const failAssign = (await db.query<{ r: { error?: string } }>(`select public.assign_staff($1, $2) as r`, [eventId, actors.other])).rows[0].r;
    assert.equal(failAssign.error, 'FORBIDDEN');

    // Organizer assigns actors.other as STAFF
    await asUser(db, actors.organizer);
    const assignSuccess = (await db.query<{ r: { status: string; userId: string } }>(`select public.assign_staff($1, $2) as r`, [eventId, actors.other])).rows[0].r;
    assert.equal(assignSuccess.status, 'ASSIGNED');

    // actors.other now has STAFF access in staff_events
    await asUser(db, actors.other);
    const otherEvents = (await db.query<{ r: { slug: string }[] }>(`select public.staff_events() as r`)).rows[0].r;
    assert.ok(otherEvents.some(e => e.slug === 'senja-di-summa'));

    // Organizer unassigns actors.other
    await asUser(db, actors.organizer);
    const unassignSuccess = (await db.query<{ r: { status: string } }>(`select public.unassign_staff($1, $2) as r`, [eventId, actors.other])).rows[0].r;
    assert.equal(unassignSuccess.status, 'UNASSIGNED');

    // actors.other no longer has STAFF access
    await asUser(db, actors.other);
    const afterUnassign = (await db.query<{ r: { slug: string }[] }>(`select public.staff_events() as r`)).rows[0].r;
    assert.equal(afterUnassign.some(e => e.slug === 'senja-di-summa'), false);
  } finally {
    await db.close();
  }
});

