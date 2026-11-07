import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCheckInsByPeriod,
  exportCheckInHistory,
  exportAuditHistory,
  type CheckInRecord,
  type CheckInAuditRecord,
} from '../src/features/check-in/core';

test('filterCheckInsByPeriod correctly filters check-ins by period', () => {
  const baseTime = new Date('2026-11-07T14:00:00.000Z');

  const records: CheckInRecord[] = [
    {
      ticketId: 't-1',
      reference: 'SPT-001',
      attendeeName: 'Andi',
      seatLabel: 'A1',
      categoryName: 'Regular',
      checkedInAt: new Date('2026-11-07T13:45:00.000Z').toISOString(), // 15 mins ago
      staffId: 'staff-1',
      isMe: true,
    },
    {
      ticketId: 't-2',
      reference: 'SPT-002',
      attendeeName: 'Budi',
      seatLabel: 'A2',
      categoryName: 'Regular',
      checkedInAt: new Date('2026-11-07T11:30:00.000Z').toISOString(), // 2.5 hours ago
      staffId: 'staff-2',
      isMe: false,
    },
    {
      ticketId: 't-3',
      reference: 'SPT-003',
      attendeeName: 'Citra',
      seatLabel: 'B1',
      categoryName: 'Front',
      checkedInAt: new Date('2026-11-07T08:00:00.000Z').toISOString(), // 6 hours ago, but same day
      staffId: 'staff-1',
      isMe: true,
    },
    {
      ticketId: 't-4',
      reference: 'SPT-004',
      attendeeName: 'Dedi',
      seatLabel: 'B2',
      categoryName: 'Front',
      checkedInAt: new Date('2026-11-06T10:00:00.000Z').toISOString(), // Yesterday
      staffId: 'staff-3',
      isMe: false,
    },
  ];

  // Test ALL
  const all = filterCheckInsByPeriod(records, 'ALL', baseTime);
  assert.equal(all.length, 4);

  // Test 1H (only t-1)
  const oneHour = filterCheckInsByPeriod(records, '1H', baseTime);
  assert.equal(oneHour.length, 1);
  assert.equal(oneHour[0].reference, 'SPT-001');

  // Test 4H (t-1 and t-2)
  const fourHours = filterCheckInsByPeriod(records, '4H', baseTime);
  assert.equal(fourHours.length, 2);
  assert.deepEqual(fourHours.map(r => r.reference), ['SPT-001', 'SPT-002']);

  // Test TODAY (t-1, t-2, and t-3; excludes yesterday t-4)
  const today = filterCheckInsByPeriod(records, 'TODAY', baseTime);
  assert.equal(today.length, 3);
  assert.deepEqual(today.map(r => r.reference), ['SPT-001', 'SPT-002', 'SPT-003']);
});

test('exportCheckInHistory generates valid RFC 4180 CSV with UTF-8 BOM and formula sanitization', () => {
  const records: CheckInRecord[] = [
    {
      ticketId: 't-safe',
      reference: 'SPT-SAFE001',
      attendeeName: 'Budi Santoso',
      seatLabel: 'Row A1',
      categoryName: 'VIP',
      checkedInAt: '2026-11-07T10:00:00.000Z',
      staffId: 'staff-123',
      isMe: true,
    },
    {
      ticketId: 't-injection',
      reference: 'SPT-INJ002',
      attendeeName: '=cmd|"/c calc"!A0', // Injection test
      seatLabel: '+Front-1',
      categoryName: '@DangerCategory',
      checkedInAt: '2026-11-07T10:15:00.000Z',
      staffId: 'staff-456',
      isMe: false,
    },
    {
      ticketId: 't-quotes',
      reference: 'SPT-QUOTE03',
      attendeeName: 'John "The Rock" Doe',
      seatLabel: 'Seat "B2"',
      categoryName: 'Regular',
      checkedInAt: '2026-11-07T10:30:00.000Z',
      staffId: 'staff-789',
      isMe: true,
    },
  ];

  const csv = exportCheckInHistory(records, 'Konser Musik Summa');

  // Check UTF-8 BOM
  assert.ok(csv.startsWith('\uFEFF'));

  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 4); // 1 header + 3 rows

  // Verify Header
  assert.equal(
    lines[0],
    '"Nomor Tiket","Nama Acara","Nama Peserta","Kategori","Kursi / Section","Waktu Check-in (WIB)","ID Petugas","Status"'
  );

  // Row 1 (Standard)
  assert.ok(lines[1].includes('"SPT-SAFE001"'));
  assert.ok(lines[1].includes('"Konser Musik Summa"'));
  assert.ok(lines[1].includes('"Budi Santoso"'));
  assert.ok(lines[1].includes('"HADIR"'));

  // Row 2 (Formula injection protection)
  // '=' should be escaped as "'="
  assert.ok(lines[2].includes('\'=cmd|""/c calc""!A0'));
  // '+' should be escaped as "'+Front-1"
  assert.ok(lines[2].includes("'+Front-1"));
  // '@' should be escaped as "'@DangerCategory"
  assert.ok(lines[2].includes("'@DangerCategory"));

  // Row 3 (Quotes escaping)
  assert.ok(lines[3].includes('"John ""The Rock"" Doe"'));
  assert.ok(lines[3].includes('"Seat ""B2"""'));
});

test('exportAuditHistory outputs valid CSV with audit metadata', () => {
  const audits: CheckInAuditRecord[] = [
    {
      id: 'audit-001',
      ticketId: 'ticket-999',
      reference: 'SPT-999888',
      slug: 'senja-di-summa',
      attendeeName: 'Siti Rahma',
      action: 'REVERT_CHECK_IN',
      reason: 'Salah scan tiket pengunjung lain',
      performedBy: 'staff-user-id-1',
      performedByName: 'Budi Petugas Gate 1',
      performedAt: '2026-11-07T11:00:00.000Z',
      previousCheckedInAt: '2026-11-07T10:45:00.000Z',
    },
  ];

  const csv = exportAuditHistory(audits, 'Senja di Summa');

  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 2); // 1 header + 1 row

  assert.ok(lines[0].includes('ID Audit'));
  assert.ok(lines[0].includes('Alasan Koreksi'));
  assert.ok(lines[1].includes('"audit-001"'));
  assert.ok(lines[1].includes('"SPT-999888"'));
  assert.ok(lines[1].includes('"Salah scan tiket pengunjung lain"'));
  assert.ok(lines[1].includes('"Budi Petugas Gate 1"'));
});
