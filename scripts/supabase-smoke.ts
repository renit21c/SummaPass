import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { decodeEvent, decodeCatalog, catalogResult } from '../src/features/catalog/contract';
import { createTicketPack, decryptToken, tokenHash } from '../src/features/tickets/crypto';
import type { Inventory, Booking } from '../src/features/booking/types';
import type { StoredTicket } from '../src/features/tickets/types';

async function main() {
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.SUMMAPASS_ALLOW_REMOTE_TESTS !== 'true') {
  console.error('Tidak dijalankan. Gunakan proyek staging dan set SUMMAPASS_ALLOW_REMOTE_TESTS=true untuk membuat data uji.');
  process.exit(1);
}
const config = (name: string) => { const value = process.env[name]; if (!value) throw new Error('Konfigurasi belum diisi: ' + name); return value; };
const url = config('NEXT_PUBLIC_SUPABASE_URL'), publishable = config('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const client = (key = publishable) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const anonymous = client(), admin = client(config('SUPABASE_SERVICE_ROLE_KEY'));
const keyText = config('SUMMAPASS_TICKET_KEY_V1');
if (!/^[a-fA-F0-9]{64}$/.test(keyText)) throw new Error('Kunci tiket harus 64 karakter hex.');
const encryptionKey = Buffer.from(keyText, 'hex');
async function rpc<T>(connection: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await connection.rpc(name, args);
  if (error) throw new Error('RPC gagal: ' + name + ' (' + error.code + ')');
  return data as T;
}
async function actor(name: string) {
  const connection = client();
  const { data, error } = await connection.auth.signInWithPassword({ email: config('SUMMAPASS_TEST_' + name + '_EMAIL'), password: config('SUMMAPASS_TEST_' + name + '_PASSWORD') });
  if (error || !data.user) throw new Error('Akun staging gagal masuk: ' + name);
  return { connection, id: data.user.id };
}

const [organizer, first, second, staff] = await Promise.all(['ORGANIZER', 'BUYER1', 'BUYER2', 'STAFF'].map(actor));
assert.equal(new Set([organizer.id, first.id, second.id, staff.id]).size, 4, 'Gunakan empat akun staging berbeda.');
const now = Date.now(), start = new Date(now + 7 * 86400000).toISOString();
const input = { title: 'Uji integrasi ' + randomUUID().slice(0, 8), description: 'Acara fiktif khusus pengujian integrasi staging.', category: 'Musik', startsAt: start, endsAt: new Date(now + 7 * 86400000 + 10800000).toISOString(), salesStart: new Date(now - 86400000).toISOString(), salesEnd: start, price: 75000, frontPrice: 125000, frontQuota: 24, regularQuota: 24, rules: 'Data pengujian, tidak untuk penjualan nyata.', organizer: 'Organizer staging', area: 'Venue staging', theme: 'play' };
const event = decodeEvent(catalogResult(await rpc(organizer.connection, 'manage_event', { p_action: 'create', p_id: null, p_data: input }), null));
console.log('Event staging dibuat: ' + event.slug);
const mutate = (action: string, data: unknown = {}) => rpc<Record<string, unknown>>(organizer.connection, 'manage_event', { p_action: action, p_id: event.id, p_data: data });
try {
  assert.equal(decodeCatalog(await rpc(anonymous, 'public_catalog', { p_slug: event.slug })).length, 0);
  assert.equal((await rpc<{ error: string }>(first.connection, 'organizer_event', { p_id: event.id })).error, 'FORBIDDEN');
  const assignment = await admin.from('event_access').insert({ event_id: event.id, user_id: staff.id, role: 'STAFF' });
  if (assignment.error) throw new Error('Penugasan petugas staging gagal.');
  const path = event.id + '/' + randomUUID() + '.webp';
  const image = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#ff6b00' } }).webp().toBuffer();
  const uploaded = await organizer.connection.storage.from('event-covers').upload(path, image, { contentType: 'image/webp', upsert: false });
  if (uploaded.error) throw new Error('Upload cover staging gagal.');
  assert.ok((await anonymous.storage.from('event-covers').download(path)).error, 'Cover draf harus privat.');
  const covered = await mutate('cover', { coverUrl: '/api/covers/' + path.replace('/', '_') }); assert.equal(covered.error, undefined);
  assert.equal((await mutate('publish')).error, undefined);
  assert.equal(decodeCatalog(await rpc(anonymous, 'public_catalog', { p_slug: event.slug })).length, 1);
  assert.equal((await anonymous.storage.from('event-covers').download(path)).error, null);
  const inventory = await rpc<Inventory>(first.connection, 'seat_inventory', { p_slug: event.slug });
  const category = inventory.categories.find(c => c.name === 'Regular')!;
  const available = inventory.seats.filter(s => s.section === 'Regular' && s.status === 'AVAILABLE');
  assert.ok(available.length >= 2);
  const reserve = (who: typeof first, seats: string[]) => rpc<Booking & { error?: string }>(who.connection, 'reserve_booking', { p_slug: event.slug, p_category: category.id, p_items: seats.map(seatId => ({ seatId, name: 'Peserta staging' })), p_key: randomUUID() });
  // Two independent authenticated clients issue concurrent real RPC requests.
  const race = await Promise.all([reserve(first, [available[0].id]), reserve(second, [available[0].id])]);
  assert.equal(race.filter(r => r.id).length, 1); assert.equal(race.filter(r => r.error === 'SEAT_UNAVAILABLE').length, 1);
  const index = race.findIndex(r => r.id), winner = index === 0 ? first : second, loser = index === 0 ? second : first, booking = race[index];
  const conflict = await reserve(loser, [available[0].id, available[1].id]); assert.equal(conflict.error, 'SEAT_UNAVAILABLE');
  const recheck = await rpc<Inventory>(loser.connection, 'seat_inventory', { p_slug: event.slug }); assert.equal(recheck.seats.find(s => s.id === available[1].id)?.status, 'AVAILABLE');
  assert.equal((await mutate('update', { ...input, area: 'Lokasi berbeda' })).error, 'EVENT_LOCKED');
  const packs = [createTicketPack(available[0].id, encryptionKey)];
  const paymentArgs = { p_user: winner.id, p_booking: booking.id, p_outcome: 'success', p_tickets: packs };
  await Promise.all([rpc(admin, 'process_simulated_payment', paymentArgs), rpc(admin, 'process_simulated_payment', paymentArgs)]);
  const tickets = await rpc<StoredTicket[]>(admin, 'issued_tickets_for_owner', { p_user: winner.id, p_ticket: null });
  const issued = tickets.filter(t => t.bookingId === booking.id); assert.equal(issued.length, 1); assert.equal(issued[0].price, 75000);
  const raw = decryptToken(issued[0].encryptedToken, encryptionKey);
  const scanArgs = { p_slug: event.slug, p_reference: null, p_hash: tokenHash(raw), p_confirm: true };
  const scanned = await Promise.all([rpc<{ status: string }>(staff.connection, 'validate_check_in', scanArgs), rpc<{ status: string }>(staff.connection, 'validate_check_in', scanArgs)]);
  assert.equal(scanned.filter(r => r.status === 'CHECKED_IN').length, 1); assert.equal(scanned.filter(r => r.status === 'ALREADY_USED').length, 1);
  assert.equal((await rpc<{ error: string }>(loser.connection, 'get_booking', { p_id: booking.id })).error, 'NOT_FOUND');
  // A fresh authenticated client must still see the persisted booking.
  const reconnect = await actor(winner.id === first.id ? 'BUYER1' : 'BUYER2');
  assert.equal((await rpc<Booking>(reconnect.connection, 'get_booking', { p_id: booking.id })).status, 'CONFIRMED');
  assert.equal((await mutate('update', { ...input, title: 'Judul setelah tiket terbit' })).error, undefined);
  assert.equal((await mutate('unpublish')).error, undefined);
  assert.equal((await anonymous.storage.from('event-covers').download(path)).error === null, false);
  const historical = await rpc<StoredTicket[]>(admin, 'issued_tickets_for_owner', { p_user: winner.id, p_ticket: issued[0].id });
  assert.equal(historical[0].event?.title, input.title);
  console.log('PASS: Storage privacy, role scope, concurrent reservation/payment/check-in, reconnect and historical ticket.');
} finally {
  // Retain auditable staging records instead of hard-deleting transactions.
  await mutate('unpublish').catch(() => {});
  console.log('Catatan uji tetap tersimpan pada event staging yang disembunyikan.');
}

}
void main().catch(() => { console.error('Pengujian staging gagal. Periksa akun, konfigurasi, dan migrasi.'); process.exitCode=1; });
