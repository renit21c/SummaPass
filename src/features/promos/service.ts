import 'server-only';
import { authMode } from '@/lib/auth/config';
import { supabaseServer } from '@/lib/supabase/server';
import { catalogResult } from '../catalog/contract';
import { managedEvent } from '../catalog/service';
import { BookingError } from '../booking/types';
import { promoInputSchema,promoSchema,type Promo } from './core';
import * as local from './persistence';
import { z } from 'zod';
async function rpc(name:string,args:Record<string,unknown>){
 const {data,error}=await (await supabaseServer()).rpc(name,args);
 if(error)throw new BookingError('DATABASE','Promo belum dapat diproses. Pastikan migrasi 024 sudah dijalankan.',503);
 return catalogResult(data,null);
}
export async function getPromosByEvent(eventId:string):Promise<Promo[]>{
 await managedEvent(eventId);
 return authMode()==='demo'?local.getPromosByEvent(eventId):z.array(promoSchema).parse(await rpc('organizer_promos',{p_event:eventId}));
}
export async function publicPromos(slug:string,code?:string|null):Promise<Promo[]>{
 if(authMode()==='supabase')return z.array(promoSchema).parse(await rpc('public_event_promos',{p_slug:slug,p_code:code??null}));
 const { inventory,demoPublicEvent }=await import('../booking/service');
 const inv=await inventory(slug),event=demoPublicEvent(slug),now=Date.now();
 return local.getPromosByEvent(event?.id??inv.eventId).filter(p=>p.status==='ACTIVE'&&Date.parse(p.startDate)<=now&&Date.parse(p.endDate)>now&&(p.quota==null||p.usedCount<p.quota)&&(p.type==='AUTOMATIC'||p.code===code?.trim().toUpperCase()));
}
export async function createPromo(eventId:string,raw:unknown){
 await managedEvent(eventId);const input=promoInputSchema.parse(raw);
 return authMode()==='demo'?local.createPromo(eventId,input):promoSchema.parse(await rpc('manage_event_promo',{p_event:eventId,p_action:'create',p_id:null,p_data:input}));
}
export async function updatePromo(eventId:string,id:string,raw:unknown){
 const current=(await getPromosByEvent(eventId)).find(p=>p.id===id);
 if(!current)throw new BookingError('NOT_FOUND','Promo tidak ditemukan.',404);
 const patch=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().safeParse(raw);
 const input=patch.success?patch.data:promoInputSchema.parse({...current,...(raw as Record<string,unknown>)});
 return authMode()==='demo'?local.updatePromo(id,input):promoSchema.parse(await rpc('manage_event_promo',{p_event:eventId,p_action:patch.success?'status':'update',p_id:id,p_data:input}));
}
export async function deletePromo(eventId:string,id:string){
 const current=(await getPromosByEvent(eventId)).find(p=>p.id===id);
 if(!current)throw new BookingError('NOT_FOUND','Promo tidak ditemukan.',404);
 if(authMode()==='demo')return local.deletePromo(id);
 await rpc('manage_event_promo',{p_event:eventId,p_action:'delete',p_id:id,p_data:{}});return true;
}
