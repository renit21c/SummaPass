import 'server-only';
import { z } from 'zod';
import type { Ticket,StoredTicket } from './types';
import { createTicketPack,decryptToken } from './crypto';
import { paymentConfiguration } from './admin';
import { BookingError,type Booking } from '@/features/booking/types';
export async function confirmSupabasePayment(userId:string,booking:Booking,outcome:'success'|'failure'){
 const {client,key}=paymentConfiguration();const packs=outcome==='success'&&booking.status==='PENDING_PAYMENT'?booking.items.map(item=>createTicketPack(item.seatId,key)):[];
 const {data,error}=await client.rpc('process_simulated_payment',{p_user:userId,p_booking:booking.id,p_outcome:outcome,p_tickets:packs});
 if(error)throw new BookingError('PAYMENT_ERROR','Pembayaran belum dapat diproses. Perbarui status sebelum mencoba kembali.',503);
 const result=z.object({error:z.string().optional(),message:z.string().optional()}).passthrough().parse(data);
 if(result.error)throw new BookingError(result.error,result.message??'Pembayaran belum berhasil.',result.error==='NOT_FOUND'?404:409);
}
export async function supabaseTickets(userId:string,id?:string):Promise<Ticket[]>{const {client,key}=paymentConfiguration();const {data,error}=await client.rpc('issued_tickets_for_owner',{p_user:userId,p_ticket:id??null});if(error)throw new BookingError('TICKET_ERROR','Tiket belum dapat dimuat. Silakan coba kembali.',503);const records=data as StoredTicket[];return records.map(({userId:owner,encryptedToken,tokenHash:hash,...ticket})=>({...ticket,token:decryptToken(encryptedToken,key)}));}
