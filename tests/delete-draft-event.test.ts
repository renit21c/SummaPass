import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { actors, asUser, catalogDb, newEvent } from './helpers/catalog-db';

test('organizer can permanently delete a demo event and all sales history in PostgreSQL', async () => {
  const db = await catalogDb();
  try {
    await asUser(db, actors.organizer);
    const created = (await db.query<{ result: { id: string } }>('select public.manage_event($1,$2,$3::jsonb) as result', ['create', null, JSON.stringify(newEvent())])).rows[0].result;
    assert.ok(created.id);
    await asUser(db, actors.buyer);
    const denied = (await db.query<{ result: { error: string } }>('select public.delete_demo_event($1,$2) as result', [created.id, 'Acara Integrasi'])).rows[0].result;
    assert.equal(denied.error, 'FORBIDDEN');
    await asUser(db, actors.organizer);
    const wrongConfirmation = (await db.query<{ result: { error: string } }>('select public.delete_demo_event($1,$2) as result', [created.id, 'salah'])).rows[0].result;
    assert.equal(wrongConfirmation.error, 'INPUT');
    const deleted = (await db.query<{ result: { deleted: boolean } }>('select public.delete_demo_event($1,$2) as result', [created.id, 'Acara Integrasi'])).rows[0].result;
    assert.equal(deleted.deleted, true);
    assert.equal((await db.query('select id from public.events where id=$1', [created.id])).rows.length, 0);

    const category=(await db.query<{id:string}>("select id from public.ticket_categories where event_id='20000000-0000-4000-8000-000000000001' limit 1")).rows[0].id;
    await db.exec('reset role;');
    await db.query("insert into public.bookings(reference,user_id,event_id,category_id,status,expires_at,total_idr,idempotency_key,request_items) values('SPB-PURGE',$1,'20000000-0000-4000-8000-000000000001',$2,'CONFIRMED',clock_timestamp()+interval '10 minutes',100000,gen_random_uuid(),'[]'::jsonb)",[actors.buyer,category]);
    await asUser(db,actors.organizer);
    const withSales=(await db.query<{result:{deleted:boolean;removed:{bookings:number}}}>("select public.delete_demo_event('20000000-0000-4000-8000-000000000001','Senja di Summa') as result")).rows[0].result;
    assert.equal(withSales.deleted,true);
    assert.equal(withSales.removed.bookings,1);
  } finally { await db.close(); }
});

test('demo draft deletion removes only the organizer owned draft', () => {
  const store = new DemoBookingStore();
  const event = store.createEvent('owner', { ...newEvent(), category: 'Musik', theme: 'play' });
  assert.throws(() => store.deleteEvent('other', event.id,event.title));
  assert.throws(() => store.deleteEvent('owner',event.id,'salah'));
  assert.equal(store.deleteEvent('owner', event.id,event.title).deleted, true);
  assert.throws(() => store.assignedEvent('owner', event.id));
});
