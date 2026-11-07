import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.SUMMAPASS_TEST_BASE_URL || 'http://127.0.0.1:3002';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('LOCAL_PREVIEW_ONLY');
const request = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
async function login() {
  const response = await request('/api/auth/login', { method: 'POST', headers: { Origin: base }, body: new URLSearchParams({ demoRole: 'organizer' }) });
  assert.equal(response.status, 303); const cookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie); return cookie;
}
const event = '20000000-0000-4000-8000-000000000001', id = randomUUID();
const invites = `/api/organizer/events/${event}/invitations`, queue = `/api/organizer/events/${event}/notifications`, cancel = `/api/organizer/events/${event}/cancel`, accept = `/api/staff/invitations/${id}`;
const mutate = (path, body, cookie, method = 'POST', origin = base) => request(path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
for (const path of [invites, queue, accept]) assert.equal((await request(path)).status, 401);
assert.equal((await mutate(accept)).status, 401);
assert.equal((await mutate(cancel, { reason: 'Pembatalan fiktif untuk tes HTTP.', key: id })).status, 401);
const protectedPage = await request(`/staff/invitations/${id}`); assert.ok([303, 307].includes(protectedPage.status)); assert.ok(protectedPage.headers.get('location')?.includes('/login'));
const cookie = await login();
for (const [path, body, method] of [
  [invites, { email: 'staff@example.test', key: id }, 'POST'],
  [cancel, { reason: 'Pembatalan fiktif untuk tes HTTP.', key: id }, 'POST'],
  [accept, undefined, 'POST'],
  [queue, { jobId: id, reason: 'Perbaikan fiktif pada konfigurasi.' }, 'PATCH']
]) {
  assert.equal((await mutate(path, body, cookie, method, 'https://other.example')).status, 403);
  const result = await mutate(path, body, cookie, method); assert.equal(result.status, 409); assert.equal((await result.json()).code, 'SUPABASE_REQUIRED');
}
assert.equal((await request('/api/staff/invitations/not-a-uuid')).status, 400);
assert.equal((await mutate(invites, { email: 'not-an-email', key: id }, cookie)).status, 400);
assert.equal((await mutate(invites, { email: 'x'.repeat(6000), key: id }, cookie)).status, 413);
assert.equal((await mutate(cancel, { reason: 'short', key: id }, cookie)).status, 400);
assert.equal((await request(queue + '?status=unknown', { headers: { cookie } })).status, 400);
assert.equal((await request(queue + '?limit=101', { headers: { cookie } })).status, 400);
const webhook = await mutate('/api/webhooks/resend', { type: 'email.delivered' }); assert.ok([401, 503].includes(webhook.status));
console.log('PASS: operations HTTP authentication, Origin, body/UUID/email/limit validation, invitation login redirect, explicit demo isolation and unsigned webhook rejection.');
