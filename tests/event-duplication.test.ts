import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { duplicateEventInput, seedManaged, eventFieldLimits, type ManagedEvent } from '../src/features/catalog/core';
import { events } from '../src/features/events/data';

function baseManaged(overrides: Partial<ManagedEvent> = {}): ManagedEvent {
  const seed = seedManaged(events[0], 0);
  return {
    ...seed,
    ...overrides,
  };
}

test('duplicateEventInput appends suffix and preserves fields', () => {
  const source = baseManaged({
    title: 'Konser Senja Spesial',
    description: 'Deskripsi lengkap pertunjukan musik akustik di mall dengan musisi lokal ternama.',
    price: 150000,
    frontPrice: 250000,
    regularQuota: 20,
    frontQuota: 15,
    rules: 'Hadir 15 menit sebelum open gate.',
    organizer: 'Summa Entertainment',
    area: 'Atrium Utama Lantai Ground',
    category: 'Musik',
    theme: 'night',
  });

  const nowMs = Date.parse('2026-11-01T00:00:00Z');
  const input = duplicateEventInput(source, nowMs);

  assert.equal(input.title, 'Konser Senja Spesial (Salinan)');
  assert.equal(input.description, source.description);
  assert.equal(input.price, 150000);
  assert.equal(input.frontPrice, 250000);
  assert.equal(input.regularQuota, 20);
  assert.equal(input.frontQuota, 15);
  assert.equal(input.rules, source.rules);
  assert.equal(input.organizer, source.organizer);
  assert.equal(input.area, source.area);
  assert.equal(input.category, 'Musik');
  assert.equal(input.theme, 'night');
});

test('duplicateEventInput truncates long titles to stay within maximum limit', () => {
  const longTitle = 'A'.repeat(120);
  const source = baseManaged({ title: longTitle });
  const input = duplicateEventInput(source);

  assert.ok(input.title.endsWith(' (Salinan)'));
  assert.ok(input.title.length <= eventFieldLimits.title.max, `Title length ${input.title.length} should be <= ${eventFieldLimits.title.max}`);
  assert.equal(input.title, 'A'.repeat(110) + ' (Salinan)');
});

test('duplicateEventInput shifts past events into the future while maintaining duration', () => {
  const nowMs = Date.parse('2026-11-10T10:00:00.000Z');
  // Event that took place in October 2026 (past)
  const pastStart = '2026-10-15T12:00:00.000Z';
  const pastEnd = '2026-10-15T15:30:00.000Z'; // 3.5 hours duration
  const originalDurationMs = Date.parse(pastEnd) - Date.parse(pastStart);

  const source = baseManaged({
    startsAt: pastStart,
    endsAt: pastEnd,
    salesStart: '2026-10-01T00:00:00.000Z',
    salesEnd: pastStart,
  });

  const input = duplicateEventInput(source, nowMs);
  const newStart = Date.parse(input.startsAt);
  const newEnd = Date.parse(input.endsAt);
  const newSalesStart = Date.parse(input.salesStart);
  const newSalesEnd = Date.parse(input.salesEnd);

  // Starts at least 7 days from now
  assert.ok(newStart >= nowMs + 7 * 86400000, 'Shifted event should start at least 7 days in future');
  // Preserves exact duration
  assert.equal(newEnd - newStart, originalDurationMs, 'Duration should be preserved');
  // Sales start is now and sales end is event start
  assert.equal(newSalesStart, nowMs);
  assert.equal(newSalesEnd, newStart);
  // Refinements hold
  assert.ok(newEnd > newStart);
  assert.ok(newSalesStart < newSalesEnd);
  assert.ok(newSalesEnd <= newStart);
});

test('duplicateEventInput preserves future schedule when event is already > 24 hours ahead', () => {
  const nowMs = Date.parse('2026-11-01T00:00:00.000Z');
  const futureStart = '2026-12-15T12:00:00.000Z';
  const futureEnd = '2026-12-15T15:00:00.000Z';
  const salesStart = '2026-11-15T00:00:00.000Z';
  const salesEnd = '2026-12-15T12:00:00.000Z';

  const source = baseManaged({
    startsAt: futureStart,
    endsAt: futureEnd,
    salesStart,
    salesEnd,
  });

  const input = duplicateEventInput(source, nowMs);
  assert.equal(input.startsAt, futureStart);
  assert.equal(input.endsAt, futureEnd);
  assert.equal(input.salesStart, salesStart);
  assert.equal(input.salesEnd, salesEnd);
});

test('duplicateEventInput clamps quotas and falls back gracefully for invalid values', () => {
  const source = baseManaged({
    // @ts-expect-error test invalid category
    category: 'InvalidCategory',
    // @ts-expect-error test invalid theme
    theme: 'neon',
    frontQuota: 100, // exceeds max 24
    regularQuota: 0, // below min 1
    price: -500, // below 0
  });

  const input = duplicateEventInput(source);
  assert.equal(input.category, 'Musik');
  assert.equal(input.theme, 'sunset');
  assert.equal(input.frontQuota, 24);
  assert.equal(input.regularQuota, 1);
  assert.equal(input.price, 0);
});

test('DemoBookingStore.duplicateEvent creates draft duplicate with new id and slug', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-11-05T00:00:00Z'));
  const original = store.createEvent('org-user-1', {
    title: 'Workshop Kopi Barista',
    description: 'Belajar meracik kopi dari espresso sampai latte art bersama ahli kopi ternama.',
    category: 'Workshop',
    startsAt: '2026-11-20T02:00:00.000Z',
    endsAt: '2026-11-20T05:00:00.000Z',
    salesStart: '2026-11-06T00:00:00.000Z',
    salesEnd: '2026-11-20T02:00:00.000Z',
    price: 90000,
    frontPrice: 150000,
    regularQuota: 18,
    frontQuota: 12,
    rules: 'Bawa celemek masing-masing.',
    organizer: 'Kopi Nusantara',
    area: 'Area Outdoor Parkir Barat',
    theme: 'clay',
  });

  // Duplicate the event
  const duplicated = store.duplicateEvent('org-user-1', original.id);

  assert.notEqual(duplicated.id, original.id, 'Duplicated event must have a new id');
  assert.notEqual(duplicated.slug, original.slug, 'Duplicated event must have a new slug');
  assert.equal(duplicated.status, 'DRAFT', 'Duplicated event must start as DRAFT');
  assert.equal(duplicated.ownerId, 'org-user-1', 'Duplicated event belongs to creator');
  assert.equal(duplicated.title, 'Workshop Kopi Barista (Salinan)');
  assert.equal(duplicated.price, 90000);
  assert.equal(duplicated.frontPrice, 150000);
  assert.equal(duplicated.regularQuota, 18);
  assert.equal(duplicated.frontQuota, 12);
  assert.equal(duplicated.coverUrl, '', 'Duplicated event should reset cover');

  // Verify it exists in catalog
  const fetched = store.assignedEvent('org-user-1', duplicated.id);
  assert.equal(fetched.id, duplicated.id);

  // Original is unchanged
  const origFetched = store.assignedEvent('org-user-1', original.id);
  assert.equal(origFetched.title, 'Workshop Kopi Barista');

  // Unauthorized organizer cannot duplicate
  assert.throws(() => store.duplicateEvent('other-user', original.id), /Event tidak ditugaskan/);
});

test('DemoBookingStore.duplicateEvent duplicates archived event into a fresh active draft', () => {
  const store = new DemoBookingStore(() => Date.parse('2026-12-30T00:00:00Z'));
  const original = store.createEvent('org-user-1', {
    title: 'Pesta Akhir Tahun',
    description: 'Pesta perayaan malam pergantian tahun penuh musik dan kehangatan keluarga.',
    category: 'Musik',
    startsAt: '2026-11-20T12:00:00.000Z', // In the past relative to clock
    endsAt: '2026-11-20T16:00:00.000Z',
    salesStart: '2026-11-01T00:00:00.000Z',
    salesEnd: '2026-11-20T12:00:00.000Z',
    price: 100000,
    frontPrice: 180000,
    regularQuota: 20,
    frontQuota: 20,
    rules: 'Wajib berpakaian rapi.',
    organizer: 'Panitia Tahun Baru',
    area: 'Downtown Walk',
    theme: 'night',
  });

  store.eventStatus('org-user-1', original.id, 'archive');
  assert.equal(store.assignedEvent('org-user-1', original.id).status, 'ARCHIVED');

  // Duplicating an archived event works and creates a draft with future schedule
  const duplicated = store.duplicateEvent('org-user-1', original.id);
  assert.equal(duplicated.status, 'DRAFT');
  assert.equal(duplicated.title, 'Pesta Akhir Tahun (Salinan)');
  assert.ok(Date.parse(duplicated.startsAt) > Date.parse('2026-12-30T00:00:00Z'));
});
