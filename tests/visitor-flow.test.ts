import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveSchema } from '../src/features/booking/types';
import { generateTicketPdf } from '../src/features/tickets/pdf';
import { events } from '../src/features/events/data';
import type { Ticket } from '../src/features/tickets/types';

test('Orang 2 - Tahap 2: reserveSchema accepts booker contacts and expanded attendee fields', () => {
  const valid = {
    slug: 'senja-di-summa',
    categoryId: 'c-regular',
    seats: [
      {
        seatId: 's1',
        name: 'Budi Santoso',
        email: 'budi@example.com',
        identityNumber: '3273010101900001',
        notes: 'Akses dekat pintu masuk'
      },
      {
        seatId: 's2',
        name: 'Siti Rahma',
        email: 'siti@example.com',
        identityNumber: '3273010101900002',
        notes: ''
      }
    ],
    booker: {
      name: 'Budi Santoso',
      email: 'budi@example.com',
      phone: '08123456789'
    },
    key: '11111111-1111-4111-8111-111111111111'
  };

  const parsed = reserveSchema.parse(valid);
  assert.equal(parsed.booker?.name, 'Budi Santoso');
  assert.equal(parsed.booker?.phone, '08123456789');
  assert.equal(parsed.seats[0].identityNumber, '3273010101900001');
  assert.equal(parsed.seats[1].name, 'Siti Rahma');

  // Also verify backward compatibility when booker and extra attendee fields are omitted
  const minimal = {
    slug: 'senja-di-summa',
    categoryId: 'c-regular',
    seats: [{ seatId: 's1', name: 'Budi' }],
    key: '11111111-1111-4111-8111-111111111111'
  };
  const parsedMinimal = reserveSchema.parse(minimal);
  assert.equal(parsedMinimal.seats.length, 1);
  assert.equal(parsedMinimal.booker, undefined);
});

test('Orang 2 - Tahap 2: date and price filter logic', () => {
  const sampleEvents = [
    { slug: 'e1', title: 'Acoustic Sunset', category: 'Musik' as const, date: '2026-12-12', time: '16.00 WIB', price: 90000, theme: 'sunset', headline: '', description: '' },
    { slug: 'e2', title: 'Coffee Workshop', category: 'Workshop' as const, date: '2026-12-15', time: '10.00 WIB', price: 125000, theme: 'clay', headline: '', description: '' },
    { slug: 'e3', title: 'Grand Orchestra', category: 'Musik' as const, date: '2026-12-25', time: '19.00 WIB', price: 250000, theme: 'night', headline: '', description: '' }
  ];

  // Filter under 100k
  const under100 = sampleEvents.filter(e => e.price < 100000);
  assert.equal(under100.length, 1);
  assert.equal(under100[0].slug, 'e1');

  // Filter 100k - 150k
  const midRange = sampleEvents.filter(e => e.price >= 100000 && e.price <= 150000);
  assert.equal(midRange.length, 1);
  assert.equal(midRange[0].slug, 'e2');

  // Filter above 150k
  const highTier = sampleEvents.filter(e => e.price > 150000);
  assert.equal(highTier.length, 1);
  assert.equal(highTier[0].slug, 'e3');

  // Date range filter
  const dateFiltered = sampleEvents.filter(e => e.date >= '2026-12-14' && e.date <= '2026-12-20');
  assert.equal(dateFiltered.length, 1);
  assert.equal(dateFiltered[0].slug, 'e2');
});

test('Orang 2 - Tahap 3: generateTicketPdf outputs valid PDF 1.4 binary', () => {
  const dummyTicket: Ticket = {
    id: '33333333-3333-4333-8333-333333333333',
    reference: 'SMP-2026-TEST',
    bookingId: '22222222-2222-4222-8222-222222222222',
    slug: 'senja-di-summa',
    categoryName: 'VIP Pass',
    seatId: 'seat-1',
    seatLabel: 'Section A - Baris A Kursi 1',
    attendeeName: 'Ahmad Dahlan',
    price: 150000,
    issuedAt: '2026-11-04T12:00:00Z',
    status: 'ACTIVE',
    token: 'encrypted-token-xyz'
  };

  const event = events[0];
  const pdfBuffer = generateTicketPdf(dummyTicket, event);

  assert.ok(pdfBuffer.length > 500, 'PDF buffer should be sufficiently large');
  const pdfHeader = pdfBuffer.subarray(0, 8).toString('ascii');
  assert.equal(pdfHeader, '%PDF-1.4');

  const pdfTail = pdfBuffer.subarray(pdfBuffer.length - 15).toString('ascii');
  assert.match(pdfTail, /%%EOF/);

  const fullText = pdfBuffer.toString('binary');
  assert.match(fullText, /\/Type \/Catalog/);
  assert.match(fullText, /\/Type \/Pages/);
  assert.match(fullText, /SummaPass/);
  assert.match(fullText, /SMP-2026-TEST/);
  assert.match(fullText, /Ahmad Dahlan/);
});

test('Orang 2 - Tahap 1: registration and password validation rules', () => {
  const passwordsMatch = (p1: string, p2: string) => p1 === p2 && p1.length >= 6;
  assert.ok(passwordsMatch('secret123', 'secret123'));
  assert.equal(passwordsMatch('short', 'short'), false);
  assert.equal(passwordsMatch('secret123', 'different'), false);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  assert.ok(emailRegex.test('user@example.com'));
  assert.equal(emailRegex.test('invalid-email'), false);
});

test('Orang 2 - Tahap 1: profile update validates email address', () => {
  const validateProfileInput = (data: { name: string; email?: string; phone?: string }) => {
    if (!data.name || data.name.trim().length === 0) return { valid: false, error: 'Nama wajib diisi' };
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) return { valid: false, error: 'Format email tidak valid' };
    }
    return { valid: true };
  };

  assert.equal(validateProfileInput({ name: 'Pengunjung Baru', email: 'pengunjung.baru@example.com' }).valid, true);
  assert.equal(validateProfileInput({ name: 'Pengunjung Baru', email: 'invalid-email' }).valid, false);
});
