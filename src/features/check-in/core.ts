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

