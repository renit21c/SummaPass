import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.SUMMAPASS_TEST_URL ?? 'http://127.0.0.1:3002';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Use an isolated local demo server.');
async function login(role) {
  const r = await fetch(origin + '/api/auth/login', { method: 'POST', redirect: 'manual', headers: { origin }, body: new URLSearchParams(role ? { demoRole: role } : {}) });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie;
}
const buyer = await login(), other = await login(), staff = await login('staff');
const post = (path, cookie, forged = false, body = {}) => fetch(origin + path, { method: 'POST', headers: { origin, cookie, 'Content-Type': 'application/json', ...(forged ? { 'x-forwarded-for': '203.0.113.7', 'x-user-id': 'forged' } : {}) }, body: JSON.stringify(body) });
for (const [path, cookie, limit] of [
  ['/api/bookings', buyer, 12],
  ['/api/bookings/not-a-uuid/payment', buyer, 20],
  ['/api/tickets/not-a-uuid/resend', buyer, 5],
  ['/api/staff/check-in', staff, 120],
]) {
  for (let i = 0; i < limit; i++) { const r = await post(path, cookie); assert.equal(r.status, 400, path); }
  const blocked = await post(path, cookie, true);
  assert.equal(blocked.status, 429, path); assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await blocked.json()).code, 'RATE_LIMIT');
}
const validBlocked = await post('/api/bookings', buyer, true, { slug: 'little-weekend', categoryId: 'regular', seats: [{ seatId: 'Regular-A3', name: 'Tidak boleh tersimpan' }], key: randomUUID() });
assert.equal(validBlocked.status, 429);
const inventory = await (await fetch(origin + '/api/events/little-weekend/seats')).json();
assert.equal(inventory.seats.find(s => s.id === 'Regular-A3').status, 'AVAILABLE');
assert.notEqual((await post('/api/bookings', other)).status, 429);
assert.equal((await post('/api/staff/check-in', other)).status, 403);
// Existing three login requests count towards the shared local login budget.
for (let i = 0; i < 27; i++) await login();
const blockedLogin = await fetch(origin + '/api/auth/login', { method: 'POST', redirect: 'manual', headers: { origin, accept: 'text/html', 'x-forwarded-for': '198.51.100.1' }, body: new URLSearchParams() });
assert.equal(blockedLogin.status, 429); assert.equal(blockedLogin.headers.get('set-cookie'), null);
assert.match(await blockedLogin.text(), /Kembali ke halaman masuk/);
console.log('PASS: login, reservation, payment, email and staff limits; Retry-After; actor isolation; spoofed headers; authorization preserved.');
