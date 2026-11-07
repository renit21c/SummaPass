import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTicketPack } from '../src/features/tickets/crypto';
import type { Booking, Inventory } from '../src/features/booking/types';
import { decodeEvent, catalogResult } from '../src/features/catalog/contract';

async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  if (process.env.SUMMAPASS_ALLOW_REMOTE_TESTS !== 'true' || process.env.SUMMAPASS_STAGING_WORKER_PAUSED !== 'true') throw Error('STAGING_OPT_IN_REQUIRED');
  const config = (name: string) => { const value = process.env[name]; if (!value) throw Error('CONFIGURATION'); return value; };
  const url = config('NEXT_PUBLIC_SUPABASE_URL');
  // A second exact URL confirmation prevents running against the wrong configured project.
  if (config('SUMMAPASS_STAGING_SUPABASE_URL') !== url) throw Error('STAGING_PROJECT_MISMATCH');
  const client = (key = config('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = client(config('SUPABASE_SERVICE_ROLE_KEY'));
  async function rpc<T = Record<string, unknown>>(connection: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await connection.rpc(name, args); if (error) throw Error('RPC_' + name); return data as T;
  }
  async function actor(name: string) {
    const connection = client(); const email = config(`SUMMAPASS_TEST_${name}_EMAIL`);
    const { data, error } = await connection.auth.signInWithPassword({ email, password: config(`SUMMAPASS_TEST_${name}_PASSWORD`) });
    if (error || !data.user?.email_confirmed_at) throw Error('STAGING_ACTOR');
    return { connection, id: data.user.id, email };
  }
  const [organizer, buyer, other, staff] = await Promise.all(['ORGANIZER', 'BUYER1', 'BUYER2', 'STAFF'].map(actor));
  assert.equal(new Set([organizer.id, buyer.id, other.id, staff.id]).size, 4);
  const start = new Date(Date.now() + 7 * 86400000).toISOString();
  const input = { title: 'Uji backend ' + randomUUID().slice(0, 8), description: 'Acara fiktif untuk pengujian backend pada staging terpisah.', category: 'Musik', startsAt: start, endsAt: new Date(Date.parse(start) + 10800000).toISOString(), salesStart: new Date(Date.now() - 86400000).toISOString(), salesEnd: start, price: 75000, frontPrice: 125000, frontQuota: 24, regularQuota: 24, rules: 'Data uji staging.', organizer: 'QA staging', area: 'Venue uji', theme: 'play' };
  const e = decodeEvent(catalogResult(await rpc(organizer.connection, 'manage_event', { p_action: 'create', p_id: null, p_data: input }), null));
  let finished = false;
  try {
    const key = randomUUID(); const invite = await rpc<{ id: string }>(organizer.connection, 'invite_event_staff', { p_event: e.id, p_email: staff.email, p_key: key });
    assert.ok(invite.id);
    assert.equal((await rpc(organizer.connection, 'invite_event_staff', { p_event: e.id, p_email: staff.email, p_key: key })).id, invite.id);
    assert.equal((await rpc(other.connection, 'accept_staff_invitation', { p_id: invite.id })).error, 'NOT_FOUND');
    const inviteAction = { p_id: invite.id };
    // Independent authenticated HTTP connections race acceptance and revocation.
    const [accepted, revoked] = await Promise.all([
      rpc(staff.connection, 'accept_staff_invitation', inviteAction),
      rpc(organizer.connection, 'manage_staff_invitation', { ...inviteAction, p_action: 'revoke', p_key: randomUUID() })
    ]);
    assert.ok((accepted.accepted === true && revoked.error === 'NOT_PENDING') || (accepted.error === 'REVOKED' && revoked.ok === true));
    await rpc(organizer.connection, 'unassign_staff', { p_event: e.id, p_user: staff.id });
    assert.equal((await rpc(staff.connection, 'validate_check_in', { p_slug: e.slug, p_reference: 'SPT-' + 'A'.repeat(32), p_hash: null, p_confirm: true })).error, 'FORBIDDEN');
    assert.equal((await rpc(other.connection, 'notification_operations', { p_event: e.id })).error, 'FORBIDDEN');
    assert.equal((await rpc(organizer.connection, 'manage_event', { p_action: 'publish', p_id: e.id, p_data: {} })).error, undefined);
    const inv = await rpc<Inventory>(buyer.connection, 'seat_inventory', { p_slug: e.slug }); const category = inv.categories[0]; const seats = inv.seats.filter(s => category.sections.includes(s.section));
    const reserve = (who: typeof buyer, seat: string) => rpc<Booking>(who.connection, 'reserve_booking', { p_slug: e.slug, p_category: category.id, p_items: [{ seatId: seat, name: 'Peserta staging' }], p_key: randomUUID() });
    const expiring = await reserve(other, seats[0].id);
    const expiry = await admin.from('bookings').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expiring.id);
    if (expiry.error) throw Error('STAGING_EXPIRY_SETUP');
    await rpc(admin, 'enqueue_due_notifications', {});
    assert.equal((await rpc<Booking>(other.connection, 'get_booking', { p_id: expiring.id })).status, 'EXPIRED');
    const b = await reserve(buyer, seats[1].id); const paymentKey = randomBytes(32);
    // Payment may win first, but no active ticket may survive a successful cancellation.
    const [payment, cancelled] = await Promise.all([
      rpc(admin, 'process_simulated_payment', { p_user: buyer.id, p_booking: b.id, p_outcome: 'success', p_tickets: b.items.map(i => createTicketPack(i.seatId, paymentKey)) }),
      rpc(organizer.connection, 'cancel_event', { p_event: e.id, p_reason: 'Pembatalan fiktif untuk pengujian race staging.', p_key: randomUUID() })
    ]);
    assert.equal(cancelled.cancelled, true); assert.ok(payment.status === 'CONFIRMED' || payment.error === 'EVENT_CANCELLED');
    const issued = await rpc<{ bookingId: string; status: string }[]>(admin, 'issued_tickets_for_owner', { p_user: buyer.id, p_ticket: null });
    const owned = issued.filter(t => t.bookingId === b.id);
    assert.equal(owned.length, payment.status === 'CONFIRMED' ? b.items.length : 0);
    assert.ok(owned.every(t => t.status === 'REVOKED'));
    const rows = await admin.from('booking_items').select('allocation_status').eq('event_id', e.id).eq('allocation_status', 'RESERVED');
    assert.equal(rows.error, null); assert.equal(rows.data?.length, 0);
    finished = true;
    console.log('PASS: verified invitations, accept/revoke race, access removal, expiry, queue ownership and payment/cancellation race on independent staging connections.');
  } finally {
    if (!finished) await rpc(organizer.connection, 'manage_event', { p_action: 'unpublish', p_id: e.id, p_data: {} }).catch(() => {});
    console.log('Data uji tetap tersimpan sebagai riwayat staging. Worker tidak dijalankan dan email tidak dikirim oleh script ini.');
  }
}
void main().catch(() => { console.error('Pengujian belum lulus. Periksa flag staging, empat akun terverifikasi, worker yang dihentikan, URL konfirmasi dan migrasi 013 sampai 015.'); process.exitCode = 1; });
