import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { BookingError } from '../src/features/booking/types';
import { randomUUID } from 'node:crypto';

function payload(seats = ['Front-B1'], attendeeName = 'Budi Santoso') {
  return {
    slug: 'little-weekend',
    categoryId: 'front',
    seats: seats.map(seatId => ({ seatId, name: attendeeName })),
    key: randomUUID()
  };
}

test('ticket transfer updates attendee name, records previous name, and rotates cryptographic QR token', () => {
  const store = new DemoBookingStore();
  const b = store.reserve('u1', payload(['Front-B1'], 'Ahmad Dani'));
  store.payment('u1', b.id, 'success');

  const tickets = store.ticketsFor('u1');
  assert.equal(tickets.length, 1);
  const targetTicket = tickets[0];
  assert.equal(targetTicket.attendeeName, 'Ahmad Dani');
  const initialToken = targetTicket.token;

  // Transfer ticket to a new friend
  const result = store.transferTicket('u1', targetTicket.id, 'Siti Nurhaliza', 'siti@example.com', 'Diberikan ke teman');
  assert.equal(result.newAttendeeName, 'Siti Nurhaliza');
  assert.equal(result.previousAttendeeName, 'Ahmad Dani');
  assert.ok(result.transferredAt);

  // Check updated ticket in store
  const updatedTicket = store.ticket('u1', targetTicket.id);
  assert.equal(updatedTicket.attendeeName, 'Siti Nurhaliza');
  assert.equal(updatedTicket.previousAttendeeName, 'Ahmad Dani');
  assert.equal(updatedTicket.attendeeEmail, 'siti@example.com');
  // Critical security check: token is rotated so previous token is invalidated
  assert.notEqual(updatedTicket.token, initialToken);

  // Check-in staff validates the ticket with the new token
  const checkInRes = store.checkIn('staff-1', 'little-weekend', updatedTicket.token, true);
  assert.equal(checkInRes.status, 'CHECKED_IN');
  assert.equal(checkInRes.ticket?.attendeeName, 'Siti Nurhaliza');
});

test('ticket transfer rejects unauthorized user, short names, revoked tickets, and checked-in tickets', () => {
  const store = new DemoBookingStore();
  const b = store.reserve('u1', payload(['Front-B2'], 'Original Name'));
  store.payment('u1', b.id, 'success');
  const t = store.ticketsFor('u1')[0];

  // Unauthorized user u2 cannot transfer u1's ticket
  assert.throws(() => store.transferTicket('u2', t.id, 'Hacker Name'), (err: unknown) => {
    assert.ok(err instanceof BookingError);
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.status, 404);
    return true;
  });

  // Rejects invalid short name
  assert.throws(() => store.transferTicket('u1', t.id, ' A '), (err: unknown) => {
    assert.ok(err instanceof BookingError);
    assert.equal(err.code, 'INVALID_NAME');
    assert.equal(err.status, 400);
    return true;
  });

  // Cannot transfer after check-in
  store.checkIn('staff-1', 'little-weekend', t.token, true);
  assert.throws(() => store.transferTicket('u1', t.id, 'Late Name'), (err: unknown) => {
    assert.ok(err instanceof BookingError);
    assert.equal(err.code, 'ALREADY_CHECKED_IN');
    assert.equal(err.status, 409);
    return true;
  });

  // Cannot transfer revoked / refunded ticket
  const b2 = store.reserve('u1', payload(['Front-B3'], 'Revoke Me'));
  store.payment('u1', b2.id, 'success');
  const t2 = store.ticketsFor('u1').find(x => x.seatId === 'Front-B3')!;
  store.refundTicket('u1', t2.id, 'Batal');
  assert.throws(() => store.transferTicket('u1', t2.id, 'Revoked Transfer'), (err: unknown) => {
    assert.ok(err instanceof BookingError);
    assert.equal(err.code, 'ALREADY_REVOKED');
    assert.equal(err.status, 409);
    return true;
  });
});
