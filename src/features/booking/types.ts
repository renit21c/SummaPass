import { z } from 'zod';
export const reserveSchema = z.object({slug:z.string().regex(/^[a-z0-9-]+$/).max(100),categoryId:z.string().min(1).max(100),seats:z.array(z.object({seatId:z.string().min(1).max(100),name:z.string().trim().min(1,'Nama peserta wajib diisi.').max(100)})).min(1).max(6),key:z.string().uuid()}).refine(v=>new Set(v.seats.map(s=>s.seatId)).size===v.seats.length,'Kursi tidak boleh duplikat.');
export type ReserveInput=z.infer<typeof reserveSchema>;
export type SeatStatus='AVAILABLE'|'RESERVED'|'SOLD';
export type Seat={id:string;section:string;row:string;number:number;x:number;y:number;status:SeatStatus};
export type Category={id:string;name:string;price:number;quota:number;sections:string[]};
export type Inventory={eventId:string;slug:string;categories:Category[];seats:Seat[];serverNow:string;mode:'demo'|'supabase'};
export type Booking={id:string;reference:string;slug:string;eventTitle?:string;userId:string;categoryId:string;categoryName:string;status:'PENDING_PAYMENT'|'CANCELLED'|'EXPIRED'|'CONFIRMED'|'FAILED';expiresAt:string;total:number;paymentStatus?:'PENDING'|'PAID'|'FAILED'|'EXPIRED'|'CANCELLED';items:{seatId:string;label:string;name:string;price:number}[]};
export class BookingError extends Error{constructor(public code:string,message:string,public status=409){super(message);this.name='BookingError';}}
export const statusLabel={AVAILABLE:'Tersedia',RESERVED:'Ditahan',SOLD:'Terjual'};
