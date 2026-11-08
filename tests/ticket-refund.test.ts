import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { randomUUID } from 'node:crypto';

function payload(seats = ['Front-B1']) {
  return {
    slug: 'little-weekend',
    categoryId: 'front',
    seats: seats.map(seatId => ({ seatId, name: 'Budi Santoso' })),
    key: randomUUID()
  };
}

test('ticket refund revokes ticket, logs reason, and returns seat to available inventory', () => {
  const store = new DemoBookingStore();
  const b = store.reserve('u1', payload(['Front-B1']));
  store.payment('u1', b.id, 'success');

  const tickets = store.ticketsFor('u1');
  assert.equal(tickets.length, 1);
  const targetTicket = tickets[0];
  assert.equal(targetTicket.status, 'ACTIVE');

  // Verify seat is initially SOLD
  assert.equal(store.inventory('little-weekend').seats.find(s => s.id === 'Front-B1')!.status, 'SOLD');

  // Refund the ticket
  const result = store.refundTicket('u1', targetTicket.id, 'Berhalangan hadir karena mendadak ada tugas');
  assert.equal(result.refundAmount, targetTicket.price);
  assert.equal(result.ticket.status, 'REVOKED');
  assert.equal(result.ticket.cancellationReason, 'Berhalangan hadir karena mendadak ada tugas');
  assert.ok(result.ticket.cancelledAt);

  // Key check: Seat in inventory is now AVAILABLE again!
  const updatedSeat = store.inventory('little-weekend').seats.find(s => s.id === 'Front-B1')!;
  assert.equal(updatedSeat.status, 'AVAILABLE');

  // Another user can now reserve this seat!
  const b2 = store.reserve('u2', payload(['Front-B1']));
  assert.equal(b2.items[0].seatId, 'Front-B1');
  assert.equal(b2.status, 'PENDING_PAYMENT');
});

test('ticket refund rejects unauthorized users, checked-in tickets, and double refund', () => {
  const store = new DemoBookingStore();
  const b = store.reserve('u1', payload(['Front-B2']));
  store.payment('u1', b.id, 'success');
  const t = store.ticketsFor('u1')[0];

  // Unauthorized user cannot refund
  assert.throws(() => store.refundTicket('u_other', t.id, 'Coba refund'));

  // Double refund rejected
  store.refundTicket('u1', t.id, 'Batal pertama');
  assert.throws(() => store.refundTicket('u1', t.id, 'Batal kedua'), (err: any) => err.code === 'ALREADY_REVOKED');

  // Checked-in ticket cannot be refunded
  const bCheckin = store.reserve('u3', payload(['Front-B3']));
  store.payment('u3', bCheckin.id, 'success');
  const tCheckin = store.ticketsFor('u3')[0];

  // Perform staff check-in
  const checkinResult = store.checkIn('staff-demo', 'little-weekend', tCheckin.reference, true);
  assert.equal(checkinResult.status, 'CHECKED_IN');

  // Refund must fail with ALREADY_CHECKED_IN
  assert.throws(() => store.refundTicket('u3', tCheckin.id, 'Mau refund setelah masuk'), (err: any) => err.code === 'ALREADY_CHECKED_IN');
});
