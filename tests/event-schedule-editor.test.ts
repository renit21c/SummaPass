import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { actors, catalogDb, asUser, newEvent } from './helpers/catalog-db';
import { createTicketPack } from '../src/features/tickets/crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { eventInput } from '../src/features/catalog/core';
import { readFile } from 'node:fs/promises';
import type { PGlite } from '@electric-sql/pglite';

async function rpc(db: PGlite, name: string, args: unknown[]) {
  const params = args.map((_, i) => `$${i + 1}`).join(',');
  return (await db.query<{ r: any }>(`select public.${name}(${params}) as r`, args.map(a => a && typeof a === 'object' ? JSON.stringify(a) : a))).rows[0].r;
}

test('main editor reschedules held and paid events, preserves tickets and audits notifications', async () => {
  const db = await catalogDb();
  try {
    await asUser(db, actors.organizer);
    const original = newEvent();
    const event = await rpc(db, 'manage_event', ['create', null, original]);
    await rpc(db, 'manage_event', ['publish', event.id, {}]);
    await db.exec('reset role');
    const category = (await db.query<{ id: string }>(`select id from public.ticket_categories where event_id=$1 and name='Regular'`, [event.id])).rows[0].id;
    const seat = (await db.query<{ id: string }>(`select es.seat_id as id from public.event_seats es join public.seats s on s.id=es.seat_id join public.venue_sections v on v.id=s.section_id where es.event_id=$1 and v.name='Regular' limit 1`, [event.id])).rows[0].id;
    await asUser(db, actors.buyer);
    const booking = await rpc(db, 'reserve_booking', [event.slug, category, [{ seatId: seat, name: 'Peserta Uji' }], randomUUID()]);
    assert.ok(booking.id, JSON.stringify(booking));
    const next = { ...original, startsAt: '2030-12-13T16:00:00+07:00', endsAt: '2030-12-13T19:00:00+07:00' };
    for (const actor of [actors.buyer, actors.staff, actors.other]) {
      await asUser(db, actor);
      assert.equal((await rpc(db, 'manage_event', ['update', event.id, next])).error, 'FORBIDDEN');
    }
    await asUser(db, actors.organizer);
    const changed = await rpc(db, 'manage_event', ['update', event.id, next]);
    assert.equal(changed.error, undefined, changed.message);
    assert.equal(Date.parse(changed.startsAt), Date.parse(next.startsAt));
    assert.equal((await rpc(db, 'manage_event', ['update', event.id, { ...next, area: 'Area lain' }])).error, 'EVENT_LOCKED');
    await db.exec('reset role; set role service_role');
    await rpc(db, 'process_simulated_payment', [actors.buyer, booking.id, 'success', [createTicketPack(seat, randomBytes(32))]]);
    await asUser(db, actors.organizer);
    const paidChange = await rpc(db, 'manage_event', ['update', event.id, { ...next, startsAt: '2030-12-14T16:00:00+07:00', endsAt: '2030-12-14T19:00:00+07:00' }]);
    assert.equal(paidChange.error, undefined, paidChange.message);
    await db.exec('reset role');
    const notifications = await db.query(`select id from public.notifications where event_id=$1 and kind='EVENT_CHANGED' and user_id=$2`, [event.id, actors.buyer]);
    assert.equal(notifications.rows.length, 1);
    assert.ok((await db.query(`select id from public.audit_logs where event_id=$1 and action='update'`, [event.id])).rows.length >= 2);
    const tickets = await rpc(db, 'issued_tickets_for_owner', [actors.buyer, null]);
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].price, original.price);
  } finally { await db.close(); }
});

for (const mode of ['SEATED', 'GENERAL_ADMISSION'] as const) test(`main editor updates ${mode} managed sales windows atomically and preserves custom prices and packages`, async () => {
  const db = await catalogDb();
  try {
    await db.exec(await readFile('supabase/migrations/202611120026_event_editor_schedule.sql', 'utf8'));
    await asUser(db, actors.organizer);
    const original = { ...newEvent(), seatingMode: mode };
    const event = await rpc(db, 'manage_event', ['create', null, original]);
    let options = await rpc(db, 'ticket_options', [event.id]);
    const category = options.categories[0];
    options = await rpc(db, 'manage_ticket_option', [event.id, 'category', category.id, options.version, { ...category, price: 88888, salesEnd: '2030-12-11T16:00:00+07:00' }]);
    assert.equal(options.error, undefined, options.message);
    const current = await rpc(db, 'organizer_event', [event.id]);
    const preserved = await rpc(db, 'manage_event', ['update', event.id, { ...original, salesStart: current.salesStart, salesEnd: current.salesEnd, title: 'Ubah judul saja' }]);
    assert.equal(preserved.error, undefined, preserved.message);
    let after = await rpc(db, 'ticket_options', [event.id]);
    assert.equal(Date.parse(after.categories.find((c: any) => c.id === category.id).salesEnd), Date.parse('2030-12-11T16:00:00+07:00'));
    const earlier = { ...original, startsAt: '2030-12-10T16:00:00+07:00', endsAt: '2030-12-10T19:00:00+07:00' };
    assert.equal((await rpc(db, 'manage_event', ['update', event.id, earlier])).error, 'INPUT');
    const changed = await rpc(db, 'manage_event', ['update', event.id, { ...earlier, salesEnd: earlier.startsAt }]);
    assert.equal(changed.error, undefined, changed.message);
    after = await rpc(db, 'ticket_options', [event.id]);
    assert.ok(after.version > options.version);
    for (const c of after.categories) assert.equal(Date.parse(c.salesEnd), Date.parse(earlier.startsAt));
    assert.equal(after.categories.find((c: any) => c.id === category.id).price, 88888);
    assert.deepEqual(after.categories.find((c: any) => c.id === category.id).packages, options.categories.find((c: any) => c.id === category.id).packages);
    const invalid = await rpc(db, 'manage_event', ['update', event.id, { ...earlier, salesEnd: original.salesEnd }]);
    assert.equal(invalid.error, 'INPUT');
    const unchanged = await rpc(db, 'ticket_options', [event.id]);
    assert.deepEqual(unchanged, after);
  } finally { await db.close(); }
});

test('demo editor permits schedule edits with a hold while retaining the location lock', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-03T00:00:00Z'));
  const original = eventInput.parse(newEvent());
  const event = store.createEvent('org', original);
  store.eventStatus('org', event.id, 'publish');
  store.reserve('buyer', { slug: event.slug, categoryId: 'regular', seats: [{ seatId: 'Regular-A1', name: 'Peserta' }], key: randomUUID() });
  const next = { ...original, startsAt: '2030-12-13T16:00:00+07:00', endsAt: '2030-12-13T19:00:00+07:00' };
  assert.equal(Date.parse(store.updateEvent('org', event.id, next).startsAt), Date.parse(next.startsAt));
  assert.throws(() => store.updateEvent('org', event.id, { ...next, area: 'Area lain' }), /Lokasi/);
});
