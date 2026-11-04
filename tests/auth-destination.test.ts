import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleDestination } from '../src/lib/auth/destination';

test('assigned organizer and staff land in their workspace instead of account or a supplied return URL', () => {
  for (const next of ['/account', '/bookings', '/staff', 'https://example.invalid']) {
    assert.equal(roleDestination(['ORGANIZER'], next), '/organizer');
    assert.equal(roleDestination(['STAFF'], next), '/staff');
  }
  assert.equal(roleDestination(['STAFF', 'ORGANIZER']), '/organizer');
  assert.equal(roleDestination(['ORGANIZER', 'STAFF']), '/organizer');
});

test('attendees keep safe return destinations and unrecognized roles do not grant workspace defaults', () => {
  assert.equal(roleDestination([]), '/account');
  assert.equal(roleDestination([], '/events/little-weekend/seats'), '/events/little-weekend/seats');
  assert.equal(roleDestination([], '/my-tickets'), '/my-tickets');
  for (const value of ['https://example.invalid', '//example.invalid', '/api/auth/login', '/login', '/account\n']) {
    assert.equal(roleDestination([], value), '/account');
  }
  assert.equal(roleDestination(['ADMIN', 'organizer']), '/account');
});
