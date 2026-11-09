import { loadCatalog,saveCatalog } from '../catalog/persistence';
import { loadCheckIns,saveCheckIns,loadCheckInAudits,saveCheckInAudits } from '../check-in/persistence';
import { loadStaffAssignments,saveStaffAssignments } from '../organizer/staff-persistence';
import type { EventInput } from '../catalog/core';
import { confirmSupabasePayment,supabaseTickets,supabaseRefundTicket,supabaseTransferTicket } from '../tickets/supabase';
import type { Ticket } from '../tickets/types';
import 'server-only';
import { DemoBookingStore } from './demo-store';
import { authMode } from '@/lib/auth/config';
import { supabaseServer } from '@/lib/supabase/server';
import { BookingError,type Inventory,type Booking,type ReserveInput } from './types';
const state=globalThis as typeof globalThis & {summaBookingStore?:DemoBookingStore};
function demoStore(){return state.summaBookingStore??=new DemoBookingStore(undefined,loadCatalog(),loadCheckIns(),loadStaffAssignments(),loadCheckInAudits());}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const client=await supabaseServer();const {data,error}=await client.rpc(name,args);if(error)throw new BookingError('DATABASE','Reservasi belum dapat diproses. Periksa konfigurasi database.',503);const result=data as T&{error?:string;message?:string};if(result?.error)throw new BookingError(result.error,result.message??'Permintaan belum dapat diproses.',result.error==='NOT_FOUND'?404:409);return data as T;}
export async function inventory(slug:string):Promise<Inventory>{return authMode()==='demo'?demoStore().inventory(slug):rpc('seat_inventory',{p_slug:slug});}
export async function reserve(userId:string,input:ReserveInput):Promise<Booking>{return authMode()==='demo'?demoStore().reserve(userId,input):rpc('reserve_booking',{p_slug:input.slug,p_category:input.categoryId,p_items:input.seats,p_key:input.key});}
export async function booking(userId:string,id:string):Promise<Booking>{return authMode()==='demo'?demoStore().get(userId,id):rpc('get_booking',{p_id:id});}
export async function bookings(userId:string):Promise<Booking[]>{return authMode()==='demo'?demoStore().list(userId):rpc('my_bookings',{});}
export async function cancel(userId:string,id:string):Promise<Booking>{return authMode()==='demo'?demoStore().cancel(userId,id):rpc('cancel_booking',{p_id:id});}

export async function pay(userId:string,id:string,outcome:'success'|'failure'):Promise<Booking>{if(authMode()==='demo')return demoStore().payment(userId,id,outcome);const current=await booking(userId,id);await confirmSupabasePayment(userId,current,outcome);return booking(userId,id);}
export async function tickets(userId:string,bookingId?:string):Promise<Ticket[]>{const result=authMode()==='demo'?demoStore().ticketsFor(userId,bookingId):await supabaseTickets(userId);return bookingId?result.filter(t=>t.bookingId===bookingId):result;}
export async function ticket(userId:string,id:string):Promise<Ticket>{if(authMode()==='demo')return demoStore().ticket(userId,id);const result=(await supabaseTickets(userId,id))[0];if(!result)throw new BookingError('NOT_FOUND','Tiket tidak ditemukan.',404);return result;}
export async function refundTicket(userId:string,id:string,reason:string){if(authMode()==='demo')return demoStore().refundTicket(userId,id,reason);return supabaseRefundTicket(userId,id,reason);}
export async function transferTicket(userId:string,id:string,newAttendeeName:string,newAttendeeEmail?:string,reason?:string){if(authMode()==='demo')return demoStore().transferTicket(userId,id,newAttendeeName,newAttendeeEmail,reason);return supabaseTransferTicket(userId,id,newAttendeeName,newAttendeeEmail);}
export const demoOrganizerSnapshot=(userId?:string)=>demoStore().organizerSnapshot(userId);

export const demoPublicEvents=()=>demoStore().publicEvents();
export const demoPublicEvent=(slug:string)=>demoStore().publicEvent(slug);
export const demoAssignedEvent=(userId:string,id:string)=>demoStore().assignedEvent(userId,id);
function persistMutation<T>(operation:()=>T):T{const previous=demoStore().catalogItems();try{const result=operation();saveCatalog(demoStore().catalogItems());return result;}catch(e){demoStore().restoreCatalog(previous);throw e;}}
export function demoCreateEvent(userId:string,input:EventInput){return persistMutation(()=>demoStore().createEvent(userId,input));}
export function demoDuplicateEvent(userId:string,id:string){return persistMutation(()=>demoStore().duplicateEvent(userId,id));}
export function demoEditEvent(userId:string,id:string,input:EventInput){return persistMutation(()=>demoStore().updateEvent(userId,id,input));}
export function demoEventStatus(userId:string,id:string,action:'publish'|'unpublish'|'archive'){return persistMutation(()=>demoStore().eventStatus(userId,id,action));}
export function demoEventCover(userId:string,id:string,url:string){return persistMutation(()=>demoStore().eventCover(userId,id,url));}
export function demoDeleteEvent(userId:string,id:string,confirmation:string){
 const result=persistMutation(()=>demoStore().deleteEvent(userId,id,confirmation));
 try{saveCheckIns(demoStore().getCheckIns());saveCheckInAudits(demoStore().getAllCheckInAudits());saveStaffAssignments(demoStore().getStaffAssignments());}catch{}
 return result;
}

export const demoStaffEvents=(staffId?:string)=>demoStore().staffEvents(staffId);
export const demoCheckIn=(staffId:string,slug:string,credential:string,confirm:boolean)=>{
 const result=demoStore().checkIn(staffId,slug,credential,confirm);
 if(confirm&&result.status==='CHECKED_IN'){
  try{saveCheckIns(demoStore().getCheckIns());}catch{}
 }
 return result;
};
export const demoStaffReport=(staffId:string,slug:string)=>demoStore().staffReport(staffId,slug);
export const demoRevertCheckIn=(staffId:string,slug:string,ticketId:string,reason:string)=>{
 const result=demoStore().revertCheckIn(staffId,slug,ticketId,reason);
 try{
  saveCheckIns(demoStore().getCheckIns());
  saveCheckInAudits(demoStore().getAllCheckInAudits());
 }catch{}
 return result;
};
export const demoCheckInAudits=(staffId:string,slug:string)=>demoStore().getCheckInAudits(staffId,slug);
export const demoEventStaff=(userId:string,eventId:string)=>demoStore().eventStaff(userId,eventId);
export const demoAssignStaff=(userId:string,eventId:string,name:string,targetUserId?:string)=>{
 const result=demoStore().assignStaff(userId,eventId,name,targetUserId);
 try{saveStaffAssignments(demoStore().getStaffAssignments());}catch{}
 return result;
};
export const demoUnassignStaff=(userId:string,eventId:string,targetUserId:string)=>{
 demoStore().unassignStaff(userId,eventId,targetUserId);
 try{saveStaffAssignments(demoStore().getStaffAssignments());}catch{}
};

export const demoNotificationContext=(userId:string)=>({bookings:demoStore().list(userId),events:demoStore().catalogItems()});
