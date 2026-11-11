import { z } from 'zod';
import type { TicketPackage } from '../ticket-options/core';
export const reserveSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(100),
  categoryId: z.string().min(1).max(100),
  packageId:z.string().uuid().optional(),packageQuantity:z.number().int().min(1).max(6).optional(),
  seats: z.array(z.object({
    seatId: z.string().min(1).max(100),
    name: z.string().trim().min(1, 'Nama peserta wajib diisi.').max(100),
    email: z.string().email().optional().or(z.literal('')),
    identityNumber: z.string().max(50).optional(),
    notes: z.string().max(200).optional()
  })).min(1).max(30),
  booker: z.object({
    name: z.string().max(100).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(30).optional()
  }).optional(),
  voucherCode: z.string().max(50).optional().nullable(),
  key: z.string().uuid()
}).refine(v => new Set(v.seats.map(s => s.seatId)).size === v.seats.length, 'Kursi tidak boleh duplikat.').refine(v=>!!v.packageId||v.seats.length<=6,'Maksimal 6 tiket tanpa pilihan paket.');
export type ReserveInput=z.infer<typeof reserveSchema>;
export const generalAdmissionSchema=z.object({
 slug:z.string().regex(/^[a-z0-9-]+$/).max(100),categoryId:z.string().min(1).max(100),
 packageId:z.string().uuid().optional(),packageQuantity:z.number().int().min(1).max(6).optional(),
 attendees:z.array(z.object({name:z.string().trim().min(1,'Nama peserta wajib diisi.').max(100)})).min(1).max(30),
 voucherCode:z.string().max(50).optional().nullable(),
 key:z.string().uuid()
}).refine(v=>!!v.packageId||v.attendees.length<=6,'Maksimal 6 tiket tanpa pilihan paket.');
export const bookingRequestSchema=z.union([reserveSchema,generalAdmissionSchema]);
export type GeneralAdmissionInput=z.infer<typeof generalAdmissionSchema>;
export type BookingRequest=z.infer<typeof bookingRequestSchema>;
export type SeatStatus='AVAILABLE'|'RESERVED'|'SOLD';
export type Seat={id:string;section:string;row:string;number:number;x:number;y:number;status:SeatStatus};
export type Category={description?:string;packages?:TicketPackage[];id:string;name:string;price:number;quota:number;salesStart?:string;salesEnd?:string;remaining?:number;reserved?:number;sold?:number;sections:string[]};
export type Inventory={seatingMode?:'SEATED'|'GENERAL_ADMISSION';eventId:string;slug:string;width?:number;height?:number;version?:number;categories:Category[];seats:Seat[];serverNow:string;mode:'demo'|'supabase'};
export type Booking={originalTotal?:number;discountAmount?:number;promoName?:string|null;voucherCode?:string|null;packageId?:string;packageName?:string|null;packageSize?:number|null;packageQuantity?:number|null;packagePrice?:number|null;id:string;reference:string;slug:string;eventTitle?:string;eventCancelledAt?:string|null;eventCancellationReason?:string|null;userId:string;categoryId:string;categoryName:string;status:'PENDING_PAYMENT'|'CANCELLED'|'EXPIRED'|'CONFIRMED'|'FAILED';expiresAt:string;total:number;paymentStatus?:'PENDING'|'PAID'|'FAILED'|'EXPIRED'|'CANCELLED';items:{seatId:string;label:string;name:string;price:number}[]};
export class BookingError extends Error{constructor(public code:string,message:string,public status=409){super(message);this.name='BookingError';}}
export const statusLabel={AVAILABLE:'Tersedia',RESERVED:'Ditahan',SOLD:'Terjual'};
