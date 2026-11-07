import { z } from 'zod';
export const checkInInput=z.object({slug:z.string().min(1).max(100),credential:z.string().trim().min(1).max(100),confirm:z.boolean().default(false)});
export type CheckInResult={status:'VALID'|'CHECKED_IN'|'ALREADY_USED'|'INVALID'|'UNPAID'|'WRONG_EVENT'|'CANCELLED_OR_REFUNDED';ticket?:{id:string;reference:string;attendeeName:string;seatLabel:string;categoryName:string;checkedInAt?:string}};
export const outcomeLabels:Record<CheckInResult['status'],string>={VALID:'Tiket valid',CHECKED_IN:'Check-in berhasil',ALREADY_USED:'Tiket sudah digunakan',INVALID:'Tiket tidak ditemukan. Periksa nomor atau QR.',UNPAID:'Pembayaran tiket belum lunas.',WRONG_EVENT:'Tiket ini untuk event lain.',CANCELLED_OR_REFUNDED:'Tiket sudah tidak berlaku.'};

export type CheckInRecord = {
  ticketId: string;
  reference: string;
  attendeeName: string;
  seatLabel: string;
  categoryName: string;
  checkedInAt: string;
  staffId: string;
  isMe: boolean;
};

export type StaffReport = {
  slug: string;
  eventTitle: string;
  totalCheckedInByMe: number;
  totalEventCheckedIn: number;
  totalSold: number;
  attendanceRate: number;
  lastCheckedInAt?: string;
  history: CheckInRecord[];
  audits?: CheckInAuditRecord[];
};

export const revertCheckInInput = z.object({
  slug: z.string().min(1).max(100),
  ticketId: z.string().uuid('ID tiket tidak valid.'),
  reason: z.string().trim().min(3, 'Alasan koreksi minimal 3 karakter.').max(500, 'Alasan maksimal 500 karakter.'),
});

export type CheckInAuditRecord = {
  id: string;
  ticketId: string;
  reference: string;
  slug: string;
  attendeeName: string;
  action: 'REVERT_CHECK_IN';
  reason: string;
  performedBy: string;
  performedByName?: string;
  performedAt: string;
  previousCheckedInAt?: string;
};

export type CheckInPeriod = 'ALL' | '1H' | '4H' | 'TODAY';

export function filterCheckInsByPeriod(
  records: CheckInRecord[],
  period: CheckInPeriod,
  referenceTime: Date = new Date()
): CheckInRecord[] {
  if (period === 'ALL') return records;
  const nowMs = referenceTime.getTime();
  return records.filter(record => {
    const checkInMs = new Date(record.checkedInAt).getTime();
    if (isNaN(checkInMs)) return false;
    if (period === '1H') {
      return nowMs - checkInMs <= 60 * 60 * 1000 && checkInMs <= nowMs + 1000;
    }
    if (period === '4H') {
      return nowMs - checkInMs <= 4 * 60 * 60 * 1000 && checkInMs <= nowMs + 1000;
    }
    if (period === 'TODAY') {
      const refDate = new Date(referenceTime).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
      const targetDate = new Date(record.checkedInAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
      return refDate === targetDate;
    }
    return true;
  });
}

function cell(value: unknown): string {
  const text = String(value ?? '');
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}

export function exportCheckInHistory(records: CheckInRecord[], eventTitle?: string): string {
  const headers = [
    'Nomor Tiket',
    'Nama Acara',
    'Nama Peserta',
    'Kategori',
    'Kursi / Section',
    'Waktu Check-in (WIB)',
    'ID Petugas',
    'Status',
  ];
  const rows = records.map(r => {
    const wibDate = new Date(r.checkedInAt).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
    return [
      r.reference,
      eventTitle ?? '',
      r.attendeeName,
      r.categoryName,
      r.seatLabel,
      wibDate,
      r.staffId,
      'HADIR',
    ];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

export function exportAuditHistory(audits: CheckInAuditRecord[], eventTitle?: string): string {
  const headers = [
    'ID Audit',
    'Nomor Tiket',
    'Nama Acara',
    'Nama Peserta',
    'Tindakan',
    'Alasan Koreksi',
    'Petugas',
    'Waktu Koreksi (WIB)',
    'Waktu Check-in Sebelumnya',
  ];
  const rows = audits.map(a => {
    const wibDate = new Date(a.performedAt).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
    return [
      a.id,
      a.reference,
      eventTitle ?? a.slug,
      a.attendeeName,
      a.action,
      a.reason,
      a.performedByName ?? a.performedBy,
      wibDate,
      a.previousCheckedInAt ? new Date(a.previousCheckedInAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '',
    ];
  });
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}


