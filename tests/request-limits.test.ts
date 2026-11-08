import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { MemoryRateLimiter, networkIdentity, rateKey, rateLimitResponse } from '../src/lib/rate-limit/core';

test('request budgets isolate actors/actions, do not extend bans, and reopen at expiry', async () => {
  const limiter = new MemoryRateLimiter();
  const a = rateKey('reservation', 'buyer-a', 'secret');
  const b = rateKey('reservation', 'buyer-b', 'secret');
  const payment = rateKey('payment', 'buyer-a', 'secret');
  const burst = await Promise.all(Array.from({ length: 30 }, () => Promise.resolve(limiter.consume(a, 'reservation', 1000))));
  assert.equal(burst.filter(r => r.allowed).length, 12);
  assert.equal(limiter.consume(b, 'reservation', 1000).allowed, true);
  assert.equal(limiter.consume(payment, 'payment', 1000).allowed, true);
  assert.equal(limiter.consume(a, 'reservation', 60_999).retryAfter, 1);
  assert.equal(limiter.consume(a, 'reservation', 61_000).allowed, true);
  assert.equal(limiter.consume(a, 'reservation', 61_001).remaining, 10);
  const response = rateLimitResponse({ allowed: false, remaining: 0, retryAfter: 12 });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '12');
  assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal((await response.json()).code, 'RATE_LIMIT');
  const html = rateLimitResponse({ allowed: false, remaining: 0, retryAfter: 12 }, true);
  assert.equal(html.status, 429); assert.match(await html.text(), /Kembali ke halaman masuk/);
});

test('untrusted forwarded IPs cannot reset login counters; IPv6 spellings normalize', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.8', 'x-real-ip': '203.0.113.9' });
  assert.equal(networkIdentity(headers), 'shared-network');
  assert.equal(networkIdentity(headers, 'x-real-ip'), '203.0.113.9');
  headers.set('x-real-ip', 'not-an-ip');
  assert.equal(networkIdentity(headers, 'x-real-ip'), 'shared-network');
  headers.set('x-real-ip', '2001:0db8:0:0:0:0:0:1');
  const identity = networkIdentity(headers, 'x-real-ip');
  headers.set('x-real-ip', '2001:db8::1');
  assert.equal(networkIdentity(headers, 'x-real-ip'), identity);
  assert.throws(() => networkIdentity(headers, 'user-controlled-header'));
  assert.match(rateKey('loginAccount', 'person@example.test', 'key'), /^[a-f0-9]{64}$/);
  assert.notEqual(rateKey('loginAccount', 'person@example.test', 'key'), rateKey('loginNetwork', 'person@example.test', 'key'));
});

test('local capacity does not evict live limits, and expired entries are reclaimed', () => {
  const limiter = new MemoryRateLimiter(1);
  limiter.consume('a', 'reservation', 0);
  assert.throws(() => limiter.consume('b', 'reservation', 0));
  assert.equal(limiter.consume('b', 'reservation', 60_000).allowed, true);
});

test('database counters persist across callers, enforce role boundaries, reset and clean expired rows', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
    await db.exec(await readFile('supabase/migrations/202611080016_request_limits.sql', 'utf8'));
    const key = 'a'.repeat(64), other = 'b'.repeat(64);
    const consume = (id = key) => db.query<{ r: { allowed: boolean; remaining: number; retryAfter: number } }>('select public.consume_request_limit($1,3,60) r', [id]).then(r => r.rows[0].r);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => consume());
      await assert.rejects(() => db.query('select * from public.request_limit_buckets'));
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const attempts = await Promise.all(Array.from({ length: 8 }, () => consume()));
    assert.equal(attempts.filter(r => r.allowed).length, 3);
    assert.equal(attempts[3].remaining, 0); assert.ok(attempts[3].retryAfter > 0);
    assert.equal((await consume(other)).allowed, true);
    await db.exec('reset role;set role service_role');
    assert.equal((await consume()).allowed, false); // new caller/session, same durable bucket
    await assert.rejects(() => db.query('delete from public.request_limit_buckets'));
    await assert.rejects(() => db.query('select public.consume_request_limit($1,0,60)', [key]));
    await db.exec('reset role');
    await db.query("update public.request_limit_buckets set reset_at=clock_timestamp()-interval '1 second' where key_hash=$1", [key]);
    await db.query("update public.request_limit_buckets set reset_at=clock_timestamp()-interval '2 hours' where key_hash=$1", [other]);
    await db.exec('set role service_role');
    assert.equal((await consume()).remaining, 2);
    assert.equal((await db.query('select * from public.request_limit_buckets')).rows.length, 1);
  } finally { await db.close(); }
});
