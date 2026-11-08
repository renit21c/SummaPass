import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmEmailToken } from '../src/lib/auth/email-confirmation';

test('email confirmation verifies the token and chooses the destination from the action', async () => {
  const calls: unknown[] = [];
  const client = { auth: { async verifyOtp(input: unknown) { calls.push(input); return { error: null }; } } };
  const token = 'a'.repeat(64);
  for (const [type, path] of [['email', '/verify-email?verified=1'], ['recovery', '/reset-password']]) {
    assert.equal(await confirmEmailToken(new URLSearchParams({ token_hash: token, type, next: 'https://evil.example' }), client), path);
  }
  assert.deepEqual(calls, [{ token_hash: token, type: 'email' }, { token_hash: token, type: 'recovery' }]);
});

test('invalid, expired and unsupported tokens cannot produce a successful confirmation', async () => {
  let called = false;
  const client = { auth: { async verifyOtp() { called = true; return { error: { code: 'otp_expired' } }; } } };
  const invalid: Record<string, string>[] = [{}, { token_hash: 'bad', type: 'email' }, { token_hash: 'a'.repeat(64), type: 'invite' }];
  for (const params of invalid) {
    assert.equal(await confirmEmailToken(new URLSearchParams(params), client), null);
  }
  assert.equal(called, false);
  assert.equal(await confirmEmailToken(new URLSearchParams({ token_hash: 'a'.repeat(64), type: 'recovery' }), client), null);
  assert.equal(called, true);
});
