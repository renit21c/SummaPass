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
export async function supabaseRefundTicket(userId:string,id:string,reason:string){
 const {client}=paymentConfiguration();
 const tickets=await supabaseTickets(userId,id);
 const target=tickets[0];
 if(!target)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);
 if(target.status!=='ACTIVE')throw new BookingError('ALREADY_REVOKED','Tiket sudah tidak aktif atau sudah dibatalkan.',409);
 if(target.checkedInAt)throw new BookingError('ALREADY_CHECKED_IN','Tiket yang sudah digunakan check-in tidak dapat dibatalkan.',409);
 const {error:updateError}=await client.from('tickets').update({status:'REVOKED'}).eq('id',id);
 if(updateError)throw new BookingError('DATABASE','Gagal membatalkan tiket.',503);
 const {data:ticketRow}=await client.from('tickets').select('booking_item_id').eq('id',id).single();
 if(ticketRow?.booking_item_id){
  await client.from('booking_items').update({allocation_status:'RELEASED'}).eq('id',ticketRow.booking_item_id);
 }
 const cleanReason=reason?.trim()||'Pengunjung berhalangan hadir';
 const now=new Date().toISOString();
 return {
  ticket:{...target,status:'REVOKED' as const,cancelledAt:now,cancellationReason:cleanReason,refundAmount:target.price,refundStatus:'REFUNDED' as const},
  refundAmount:target.price,
  refundedAt:now,
  reason:cleanReason
 };
}
export async function supabaseTransferTicket(userId:string,id:string,newAttendeeName:string,newAttendeeEmail?:string){
 const {client,key}=paymentConfiguration();
 const tickets=await supabaseTickets(userId,id);
 const target=tickets[0];
 if(!target)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);
 if(target.status!=='ACTIVE')throw new BookingError('ALREADY_REVOKED','Hanya tiket aktif yang dapat dialihkan.',409);
 if(target.checkedInAt)throw new BookingError('ALREADY_CHECKED_IN','Tiket yang sudah digunakan check-in tidak dapat dialihkan.',409);
 const cleanName=newAttendeeName?.trim();
 if(!cleanName||cleanName.length<2)throw new BookingError('INVALID_NAME','Nama peserta baru minimal 2 karakter.',400);

 const {data:ticketRow}=await client.from('tickets').select('booking_item_id').eq('id',id).single();
 if(!ticketRow?.booking_item_id)throw new BookingError('DATABASE','Data tiket tidak valid.',503);

 const {error:attendeeError}=await client.from('attendees').update({display_name:cleanName}).eq('booking_item_id',ticketRow.booking_item_id);
 if(attendeeError)throw new BookingError('DATABASE','Gagal memperbarui nama peserta tiket.',503);

 const pack=createTicketPack(target.seatId,key);
 await client.from('tickets').update({token_hash:pack.tokenHash}).eq('id',id);
 await client.from('ticket_secrets').update({encrypted_token:pack.encryptedToken}).eq('ticket_id',id);

 const now=new Date().toISOString();
 return {
  ticket:{
   ...target,
   attendeeName:cleanName,
   previousAttendeeName:target.attendeeName,
   attendeeEmail:newAttendeeEmail?.trim().toLowerCase(),
   transferredAt:now,
   token:decryptToken(pack.encryptedToken,key)
  },
  previousAttendeeName:target.attendeeName,
  newAttendeeName:cleanName,
  transferredAt:now
 };
}
