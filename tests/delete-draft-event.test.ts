import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { actors, asUser, catalogDb, newEvent } from './helpers/catalog-db';

test('organizer can delete only an unused draft in PostgreSQL', async () => {
  const db = await catalogDb();
  try {
    await asUser(db, actors.organizer);
    const created = (await db.query<{ result: { id: string } }>('select public.manage_event($1,$2,$3::jsonb) as result', ['create', null, JSON.stringify(newEvent())])).rows[0].result;
    assert.ok(created.id);
    await asUser(db, actors.buyer);
    const denied = (await db.query<{ result: { error: string } }>('select public.delete_draft_event($1) as result', [created.id])).rows[0].result;
    assert.equal(denied.error, 'FORBIDDEN');
    await asUser(db, actors.organizer);
    const deleted = (await db.query<{ result: { deleted: boolean } }>('select public.delete_draft_event($1) as result', [created.id])).rows[0].result;
    assert.equal(deleted.deleted, true);
    assert.equal((await db.query('select id from public.events where id=$1', [created.id])).rows.length, 0);
    const deniedHistory = (await db.query<{ result: { error: string } }>('select public.delete_draft_event($1) as result', ['20000000-0000-4000-8000-000000000001'])).rows[0].result;
    assert.equal(deniedHistory.error, 'HAS_HISTORY');
  } finally { await db.close(); }
});

test('demo draft deletion removes only the organizer owned draft', () => {
  const store = new DemoBookingStore();
  const event = store.createEvent('owner', { ...newEvent(), category: 'Musik', theme: 'play' });
  assert.throws(() => store.deleteEvent('other', event.id));
  assert.equal(store.deleteEvent('owner', event.id).deleted, true);
  assert.throws(() => store.assignedEvent('owner', event.id));
});
