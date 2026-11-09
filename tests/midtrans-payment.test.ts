import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyMidtransSignature } from '../src/lib/payments/midtrans-core';

test('Midtrans signature verification succeeds for valid SHA512 hash and rejects spoofed signatures', () => {
  const serverKey = 'test-server-key-12345';
  const orderId = 'SP-956CFB1D-123456';
  const statusCode = '200';
  const grossAmount = '175000.00';

  const validRaw = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const validSignature = crypto.createHash('sha512').update(validRaw).digest('hex');

  // Valid signature must verify
  assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, validSignature, serverKey), true);
  // Case insensitive match
  assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, validSignature.toUpperCase(), serverKey), true);

  // Tampered amount or orderId must be rejected
  assert.equal(verifyMidtransSignature(orderId, statusCode, '10000.00', validSignature, serverKey), false);
  assert.equal(verifyMidtransSignature('SP-HACKED-999999', statusCode, grossAmount, validSignature, serverKey), false);

  // Tampered signature must be rejected
  assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, 'bad-signature', serverKey), false);
});
