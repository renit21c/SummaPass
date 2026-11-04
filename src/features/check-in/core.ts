import { z } from 'zod';
export const checkInInput=z.object({slug:z.string().min(1).max(100),credential:z.string().trim().min(1).max(100),confirm:z.boolean().default(false)});
export type CheckInResult={status:'VALID'|'CHECKED_IN'|'ALREADY_USED'|'INVALID'|'UNPAID'|'WRONG_EVENT'|'CANCELLED_OR_REFUNDED';ticket?:{id:string;reference:string;attendeeName:string;seatLabel:string;categoryName:string;checkedInAt?:string}};
export const outcomeLabels:Record<CheckInResult['status'],string>={VALID:'Tiket valid',CHECKED_IN:'Check-in berhasil',ALREADY_USED:'Tiket sudah digunakan',INVALID:'Tiket tidak ditemukan. Periksa nomor atau QR.',UNPAID:'Pembayaran tiket belum lunas.',WRONG_EVENT:'Tiket ini untuk event lain.',CANCELLED_OR_REFUNDED:'Tiket sudah tidak berlaku.'};
