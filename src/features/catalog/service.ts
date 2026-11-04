import 'server-only';
import { getSession,canAccessRole } from '@/lib/auth/session';
import { authMode } from '@/lib/auth/config';
import { demoPublicEvents,demoPublicEvent,demoAssignedEvent,demoCreateEvent,demoEditEvent,demoEventStatus,demoEventCover } from '../booking/service';
import { BookingError } from '../booking/types';
import type { EventInput } from './core';
import { events } from '../events/data';
export async function publicCatalog(){return authMode()==='demo'?demoPublicEvents():events;}
export async function publicEvent(slug:string){return authMode()==='demo'?demoPublicEvent(slug):events.find(e=>e.slug===slug)??null;}
export async function organizer(){const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);if(user.mode!=='demo')throw new BookingError('UNAVAILABLE','Editor event saat ini tersedia pada mode demo lokal.',503);return user;}
export async function managedEvent(id:string){const user=await organizer();return demoAssignedEvent(user.id,id);}
export async function createEvent(input:EventInput){const user=await organizer();return demoCreateEvent(user.id,input);}
export async function editEvent(id:string,input:EventInput){const user=await organizer();return demoEditEvent(user.id,id,input);}
export async function statusEvent(id:string,action:'publish'|'unpublish'|'archive'){const user=await organizer();return demoEventStatus(user.id,id,action);}
export async function coverEvent(id:string,url:string){const user=await organizer();return demoEventCover(user.id,id,url);}
