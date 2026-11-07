import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors, asUser, catalogDb, newEvent } from './helpers/catalog-db';
import { createTicketPack } from '../src/features/tickets/crypto';
import { readWebhookBody, verifyResendWebhook } from '../src/features/notifications/webhook';
import { roleDestination } from '../src/lib/auth/destination';
import type { Booking, Inventory } from '../src/features/booking/types';

type Result = Record<string, unknown>;
type Job = { id: string; leaseToken: string };
async function rpc<T = Result>(db: PGlite, name: string, args: unknown[] = []): Promise<T> {
  return (await db.query<{ r: T }>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) r`, args.map(arg => arg && typeof arg === 'object' ? JSON.stringify(arg) : arg))).rows[0].r;
}
async function worker(db: PGlite) { await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role service_role;"); }
async function setup(db: PGlite) {
  await asUser(db, actors.organizer);
  const e = await rpc<{ id: string; slug: string }>(db, 'manage_event', ['create', null, newEvent()]);
  await rpc(db, 'manage_event', ['publish', e.id, {}]);
  await asUser(db, actors.buyer);
  const inv = await rpc<Inventory>(db, 'seat_inventory', [e.slug]); const c = inv.categories[0];
  const seats = inv.seats.filter(s => c.sections.includes(s.section));
  const reserve = async (index: number) => { await asUser(db, actors.buyer); return rpc<Booking>(db, 'reserve_booking', [e.slug, c.id, [{ seatId: seats[index].id, name: 'Peserta uji' }], randomUUID()]); };
  return { e, reserve, c };
}
async function pay(db: PGlite, b: Booking) { await worker(db); return rpc(db, 'process_simulated_payment', [actors.buyer, b.id, 'success', b.items.map(i => createTicketPack(i.seatId, randomBytes(32)))]); }

test('staff invitations enforce verified recipient, expiry, idempotency, revocation and RLS without creating accounts', async () => {
  const db = await catalogDb(); try {
    const { e } = await setup(db); await db.exec('reset role');
    await db.query("update auth.users set email='staff@example.test',email_confirmed_at=clock_timestamp() where id=$1", [actors.other]);
    await asUser(db, actors.organizer); const key = randomUUID();
    const invite = await rpc<{ id: string; status: string }>(db, 'invite_event_staff', [e.id, ' Staff@Example.test ', key]);
    assert.equal(invite.status, 'PENDING'); assert.equal((await rpc(db, 'invite_event_staff', [e.id, 'staff@example.test', key])).id, invite.id);
    assert.equal((await rpc(db, 'invite_event_staff', [e.id, 'wrong@example.test', key])).error, 'IDEMPOTENCY_CONFLICT');
    assert.equal((await rpc(db, 'invite_event_staff', [e.id, 'staff@example.test', randomUUID()])).error, 'ALREADY_INVITED');
    await asUser(db, actors.buyer); assert.equal((await rpc(db, 'staff_invitation', [invite.id])).error, 'NOT_FOUND');
    assert.equal((await rpc(db, 'accept_staff_invitation', [invite.id])).error, 'NOT_FOUND');
    assert.equal((await rpc(db, 'invite_event_staff', [e.id, 'new@example.test', randomUUID()])).error, 'FORBIDDEN');
    await assert.rejects(() => db.query('select * from public.staff_invitations'));
    await asUser(db); await assert.rejects(() => rpc(db, 'accept_staff_invitation', [invite.id]));
    await asUser(db, actors.other); assert.equal((await rpc(db, 'staff_invitation', [invite.id])).status, 'PENDING');
    await db.exec('reset role'); await db.query('update auth.users set email_confirmed_at=null where id=$1', [actors.other]);
    await asUser(db, actors.other); assert.equal((await rpc(db, 'accept_staff_invitation', [invite.id])).error, 'NOT_FOUND');
    await db.exec('reset role'); await db.query('update auth.users set email_confirmed_at=clock_timestamp() where id=$1', [actors.other]);
    await asUser(db, actors.other); assert.equal((await rpc(db, 'accept_staff_invitation', [invite.id])).accepted, true);
    assert.equal((await rpc(db, 'accept_staff_invitation', [invite.id])).accepted, true);
    assert.ok((await rpc<{ slug: string }[]>(db, 'staff_events')).some(item => item.slug === e.slug));
    await asUser(db, actors.organizer); await rpc(db, 'unassign_staff', [e.id, actors.other]);
    await asUser(db, actors.other); assert.equal((await rpc(db, 'accept_staff_invitation', [invite.id])).error, 'REVOKED');
    assert.equal((await rpc(db, 'staff_invitation', [invite.id])).status, 'REVOKED');
    assert.equal((await rpc(db, 'validate_check_in', [e.slug, 'SPT-' + 'A'.repeat(32), null, true])).error, 'FORBIDDEN');
    await asUser(db, actors.organizer); const newer = await rpc<{ id: string }>(db, 'invite_event_staff', [e.id, 'unknown@example.test', randomUUID()]);
    assert.equal((await rpc(db, 'manage_staff_invitation', [newer.id, 'resend', randomUUID()])).error, 'RATE_LIMIT');
    await worker(db); const jobs = await rpc<Job[]>(db, 'claim_notification_emails', [5]);
    const contexts = await Promise.all(jobs.map(job => rpc(db, 'notification_email_context', [job.id, job.leaseToken])));
    assert.ok(contexts.some(c => c.recipientEmail === 'unknown@example.test' && c.userId === null));
    assert.ok(contexts.some(c => c.skip === 'INVITATION_INACTIVE'));
    await asUser(db, actors.organizer); await rpc(db, 'manage_staff_invitation', [newer.id, 'revoke', randomUUID()]);
    await worker(db); for (const job of jobs) assert.equal((await rpc(db, 'notification_email_context', [job.id, job.leaseToken])).skip, 'INVITATION_INACTIVE');
    await db.exec('reset role'); assert.equal((await db.query<{ n: number }>('select count(*)::int n from auth.users')).rows[0].n, 4);
    const expired = randomUUID(); await asUser(db, actors.organizer);
    const last = await rpc<{ id: string }>(db, 'invite_event_staff', [e.id, 'staff@example.test', expired]);
    await db.exec('reset role'); await db.query("update public.staff_invitations set expires_at=clock_timestamp()-interval '1 second' where id=$1", [last.id]);
    await asUser(db, actors.other); assert.equal((await rpc(db, 'accept_staff_invitation', [last.id])).error, 'EXPIRED');
  } finally { await db.close(); }
});

test('expiry scheduler releases holds and payment state once and creates a revalidated expired notification', async () => {
  const db = await catalogDb(); try {
    const { reserve, e } = await setup(db); const b = await reserve(0);
    await db.exec('reset role'); await db.query("update public.bookings set expires_at=clock_timestamp()-interval '1 second' where id=$1", [b.id]);
    await worker(db); assert.equal(await rpc(db, 'enqueue_due_notifications'), 1); assert.equal(await rpc(db, 'enqueue_due_notifications'), 0);
    const jobs = await rpc<Job[]>(db, 'claim_notification_emails', [5]); assert.equal(jobs.length, 1);
    assert.equal((await rpc(db, 'notification_email_context', [jobs[0].id, jobs[0].leaseToken])).kind, 'BOOKING_EXPIRED');
    assert.equal((await pay(db, b)).error, 'NOT_PAYABLE');
    await asUser(db, actors.buyer); const current = await rpc<Booking>(db, 'get_booking', [b.id]); assert.equal(current.status, 'EXPIRED'); assert.equal(current.paymentStatus, 'EXPIRED');
    const inv = await rpc<Inventory>(db, 'seat_inventory', [e.slug]); assert.equal(inv.seats.find(s => s.id === b.items[0].seatId)?.status, 'AVAILABLE');
    const page = await rpc<{ items: { type: string; title: string }[] }>(db, 'list_notifications'); assert.equal(page.items.filter(n => n.title === 'Reservasi berakhir').length, 1); assert.equal(page.items[0].type, 'booking');
  } finally { await db.close(); }
});

test('event cancellation is atomic, scoped, idempotent and revokes tickets while preserving paid transaction history', async () => {
  const db = await catalogDb(); try {
    const { e, reserve } = await setup(db); const paid = await reserve(0); await pay(db, paid); const pending = await reserve(1);
    await worker(db); const oldJob = (await rpc<Job[]>(db, 'claim_notification_emails', [5]))[0];
    await asUser(db, actors.buyer); const reason = 'Acara dibatalkan karena perubahan operasional.'; const key = randomUUID();
    assert.equal((await rpc(db, 'cancel_event', [e.id, reason, key])).error, 'FORBIDDEN');
    await asUser(db, actors.organizer); assert.equal((await rpc(db, 'cancel_event', [e.id, 'short', key])).error, 'INPUT');
    assert.equal((await rpc(db, 'cancel_event', [e.id, reason, key])).cancelled, true);
    assert.equal((await rpc(db, 'cancel_event', [e.id, reason, key])).cancelled, true);
    assert.equal((await rpc(db, 'cancel_event', [e.id, reason, randomUUID()])).error, 'ALREADY_CANCELLED');
    assert.equal((await rpc(db, 'manage_event', ['publish', e.id, {}])).error, 'EVENT_CANCELLED');
    await asUser(db); assert.deepEqual(await rpc(db, 'public_catalog', [e.slug]), []);
    await asUser(db, actors.buyer); const b = await rpc<Booking>(db, 'get_booking', [paid.id]); assert.equal(b.status, 'CONFIRMED'); assert.equal(b.paymentStatus, 'PAID'); assert.equal(b.eventCancellationReason, reason);
    assert.ok((await rpc<Booking[]>(db, 'my_bookings')).find(item => item.id === b.id)?.eventCancelledAt);
    assert.equal((await rpc<Booking>(db, 'get_booking', [pending.id])).status, 'CANCELLED');
    await worker(db); assert.equal((await rpc(db, 'notification_email_context', [oldJob.id, oldJob.leaseToken])).skip, 'EVENT_CANCELLED');
    assert.equal((await pay(db, pending)).error, 'EVENT_CANCELLED');
    const cancellationJobs = await rpc<Job[]>(db, 'claim_notification_emails', [5]); assert.equal(cancellationJobs.length, 1);
    assert.equal((await rpc(db, 'notification_email_context', [cancellationJobs[0].id, cancellationJobs[0].leaseToken])).kind, 'EVENT_CANCELLED');
    await db.exec('reset role'); assert.equal((await db.query<{ status: string }>('select status from public.tickets')).rows[0].status, 'REVOKED');
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.booking_items where event_id=$1 and allocation_status='RESERVED'", [e.id])).rows[0].n, 0);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from public.audit_logs where event_id=$1 and action='EVENT_CANCELLED'", [e.id])).rows[0].n, 1);
  } finally { await db.close(); }
});

test('receipt deduplication, out-of-order delivery and operator retry preserve ownership and replay limits', async () => {
  const db = await catalogDb(); try {
    const { e, reserve } = await setup(db); const b = await reserve(0); await pay(db, b);
    const job = (await rpc<Job[]>(db, 'claim_notification_emails', [5]))[0];
    const frozen = { from: 'a@example.test', to: ['b@example.test'], subject: 'Uji', text: 'Uji', html: '<p>Uji</p>' };
    await rpc(db, 'prepare_notification_email', [job.id, job.leaseToken, frozen]);
    await rpc(db, 'finish_notification_email', [job.id, job.leaseToken, 'FAILED', 'PROVIDER_HTTP_403', null]);
    await asUser(db, actors.other); assert.equal((await rpc(db, 'notification_operations', [e.id])).error, 'FORBIDDEN'); assert.equal((await rpc(db, 'retry_notification_email', [e.id, job.id, 'Konfigurasi sudah diperbaiki.'])).error, 'FORBIDDEN');
    await assert.rejects(() => db.query('select * from public.notification_receipts'));
    await asUser(db, actors.organizer); const page = await rpc<{ items: { canRetry: boolean }[] }>(db, 'notification_operations', [e.id]); assert.equal(page.items[0].canRetry, true);
    const serialized = JSON.stringify(page); for (const forbidden of ['delivery_payload', 'leaseToken', 'b@example.test', 'encryptedToken']) assert.ok(!serialized.includes(forbidden));
    assert.equal((await rpc(db, 'retry_notification_email', [e.id, job.id, 'Konfigurasi sudah diperbaiki.'])).queued, true);
    await worker(db); const retry = (await rpc<Job[]>(db, 'claim_notification_emails', [5]))[0];
    assert.deepEqual((await rpc(db, 'notification_email_context', [retry.id, retry.leaseToken])).payload, frozen);
    const provider = randomUUID(); const at = new Date().toISOString();
    // Provider receipt may arrive before the worker acknowledges acceptance.
    assert.equal((await rpc(db, 'record_notification_receipt', ['webhook-1', provider, 'email.delivered', at])).duplicate, false);
    assert.equal((await rpc(db, 'record_notification_receipt', ['webhook-1', provider, 'email.delivered', at])).duplicate, true);
    await rpc(db, 'record_notification_receipt', ['webhook-2', provider, 'email.sent', at]);
    await rpc(db, 'finish_notification_email', [retry.id, retry.leaseToken, 'SENT', null, provider]);
    await asUser(db, actors.organizer); let status = await rpc<{ items: { deliveryStatus: string }[] }>(db, 'notification_operations', [e.id]); assert.equal(status.items[0].deliveryStatus, 'DELIVERED');
    assert.equal((await rpc(db, 'retry_notification_email', [e.id, job.id, 'Konfigurasi sudah diperbaiki.'])).error, 'UNSAFE_REPLAY');
    await worker(db); await rpc(db, 'record_notification_receipt', ['webhook-3', provider, 'email.bounced', at]); await rpc(db, 'record_notification_receipt', ['webhook-4', provider, 'email.delivered', at]);
    await asUser(db, actors.organizer); status = await rpc(db, 'notification_operations', [e.id]); assert.equal(status.items[0].deliveryStatus, 'BOUNCED');
    await db.exec('reset role'); await db.query("update public.notification_outbox set status='FAILED',provider_id=null,first_attempt_at=clock_timestamp()-interval '24 hours' where id=$1", [job.id]);
    await asUser(db, actors.organizer); assert.equal((await rpc(db, 'retry_notification_email', [e.id, job.id, 'Konfigurasi sudah diperbaiki.'])).error, 'UNSAFE_REPLAY');
    await asUser(db, actors.buyer); await assert.rejects(() => rpc(db, 'record_notification_receipt', ['forged', provider, 'email.delivered', at]));
  } finally { await db.close(); }
});

test('webhook signatures reject modified bodies, stale/future timestamps and oversized chunked requests', async () => {
  const secret = randomBytes(32), encoded = 'whsec_' + secret.toString('base64'), now = Date.now(); const timestamp = String(Math.floor(now / 1000));
  const body = JSON.stringify({ type: 'email.delivered', created_at: new Date(now).toISOString(), data: { email_id: randomUUID() } });
  const signature = createHmac('sha256', secret).update(`msg_qa.${timestamp}.${body}`).digest('base64');
  const headers = new Headers({ 'svix-id': 'msg_qa', 'svix-timestamp': timestamp, 'svix-signature': `v1,invalid v1,${signature}` });
  assert.equal(verifyResendWebhook(body, headers, encoded, now), true);
  assert.equal(verifyResendWebhook(body + ' ', headers, encoded, now), false);
  assert.equal(verifyResendWebhook(body, headers, encoded, now + 301000), false);
  assert.equal(verifyResendWebhook(body, headers, encoded, now - 301000), false);
  assert.equal(verifyResendWebhook(body, headers, undefined, now), false);
  assert.equal(verifyResendWebhook(body, headers, 'whsec_invalid', now), false);
  assert.equal(await readWebhookBody(new Request('http://localhost', { method: 'POST', body })), body);
  await assert.rejects(() => readWebhookBody(new Request('http://localhost', { method: 'POST', body: 'a'.repeat(65537) })));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(40000)); controller.enqueue(new Uint8Array(40000)); controller.close(); } });
  await assert.rejects(() => readWebhookBody(new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)));
});

test('login keeps an exact invitation acceptance destination for existing staff and organizer accounts', () => {
  const destination = '/staff/invitations/' + randomUUID();
  for (const roles of [[], ['STAFF'], ['ORGANIZER']]) assert.equal(roleDestination(roles, destination), destination);
  for (const destination of ['/staff/invitations/not-a-uuid', '/staff/invitations/' + randomUUID() + '?next=https://bad.test']) assert.equal(roleDestination(['STAFF'], destination), '/staff');
});
