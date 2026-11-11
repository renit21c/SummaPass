import { getPromosByEvent as localPromos } from '../promos/persistence';
import { calculateApplicablePromo } from '../promos/core';
import type { ManagedEvent } from './core';
import 'server-only';
import { getSession,canAccessRole } from '@/lib/auth/session';
import { authMode } from '@/lib/auth/config';
import { supabaseServer } from '@/lib/supabase/server';
import { inventory,demoPublicEvents,demoPublicEvent,demoAssignedEvent,demoCreateEvent,demoDuplicateEvent,demoEditEvent,demoEventStatus,demoEventCover,demoDeleteEvent } from '../booking/service';
import { BookingError } from '../booking/types';
import { eventInput,duplicateEventInput,type EventInput } from './core';
import { catalogResult,decodeCatalog,decodeEvent } from './contract';
async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await (await supabaseServer()).rpc(name,args);return catalogResult(data,error);}
async function withPromoPrices(items:ManagedEvent[]):Promise<ManagedEvent[]>{
 if(!items.length)return items;
 if(authMode()==='demo')return Promise.all(items.map(async event=>{
  const config=await inventory(event.slug),promos=localPromos(event.id);
  const offers=config.categories.flatMap(c=>(c.packages??[]).filter(p=>p.active).map(p=>({original:p.price,...calculateApplicablePromo(promos,{categoryId:c.id,quantity:p.participants,subtotal:p.price})}))).sort((a,b)=>a.finalTotal-b.finalTotal||a.original-b.original);
  const lowest=offers?.[0];return lowest?{...event,price:lowest.finalTotal,originalPrice:lowest.original}:event;
 }));
 const values=await rpc('catalog_promo_prices',{p_slugs:items.map(e=>e.slug)}) as {slug:string;price:number;originalPrice:number}[];
 return items.map(event=>{const offer=values.find(p=>p.slug===event.slug);return offer?{...event,price:offer.price,originalPrice:offer.originalPrice}:event;});
}
export async function publicCatalog(){return withPromoPrices(authMode()==='demo'?demoPublicEvents():decodeCatalog(await rpc('public_catalog',{p_slug:null})));}
export async function publicEvent(slug:string){const event=authMode()==='demo'?demoPublicEvent(slug):decodeCatalog(await rpc('public_catalog',{p_slug:slug}))[0]??null;return event?(await withPromoPrices([event]))[0]:null;}
export async function organizer(){const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);return user;}
export async function managedEvent(id:string){const user=await organizer();return user.mode==='demo'?demoAssignedEvent(user.id,id):decodeEvent(await rpc('organizer_event',{p_id:id}));}
export async function createEvent(raw:EventInput){const user=await organizer(),input=eventInput.parse(raw);return user.mode==='demo'?demoCreateEvent(user.id,input):decodeEvent(await rpc('manage_event',{p_action:'create',p_id:null,p_data:input}));}
export async function duplicateEvent(id:string){const user=await organizer();if(user.mode==='demo')return demoDuplicateEvent(user.id,id);const source=await managedEvent(id);const input=duplicateEventInput(source);return decodeEvent(await rpc('manage_event',{p_action:'create',p_id:null,p_data:input}));}
export async function editEvent(id:string,raw:EventInput){const user=await organizer(),input=eventInput.parse(raw);return user.mode==='demo'?demoEditEvent(user.id,id,input):decodeEvent(await rpc('manage_event',{p_action:'update',p_id:id,p_data:input}));}
export async function statusEvent(id:string,action:'publish'|'unpublish'|'archive'){const user=await organizer();return user.mode==='demo'?demoEventStatus(user.id,id,action):decodeEvent(await rpc('manage_event',{p_action:action,p_id:id,p_data:{}}));}
export async function deleteEvent(id:string,confirmation:string){const user=await organizer();if(user.mode==='demo')return demoDeleteEvent(user.id,id,confirmation);return rpc('delete_demo_event',{p_event:id,p_confirmation:confirmation});}
export async function coverEvent(id:string,url:string){const user=await organizer();return user.mode==='demo'?demoEventCover(user.id,id,url):decodeEvent(await rpc('manage_event',{p_action:'cover',p_id:id,p_data:{coverUrl:url}}));}
