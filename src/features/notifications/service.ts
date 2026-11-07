import 'server-only';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { supabaseServer } from '@/lib/supabase/server';
import { catalogResult } from '@/features/catalog/contract';
import { BookingError } from '@/features/booking/types';
import { demoNotificationContext } from '@/features/booking/service';
import { notificationPage,notificationPreferences,type NotificationPreferences } from './core';
import { persistDemoNotifications } from './demo';
async function user(){const value=await getSession();if(!value)throw new BookingError('AUTH','Silakan masuk.',401);return value;}
async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await (await supabaseServer()).rpc(name,args);if((data as {error?:string})?.error==='RATE_LIMIT')throw new BookingError('RATE_LIMIT','Tunggu 60 detik. Maksimal 5 permintaan kirim ulang per hari.',429);return catalogResult(data,error);}
export async function listNotifications(cursor:string|null=null,limit=50){const session=await user();if(session.mode==='demo'){const context=demoNotificationContext(session.id);return persistDemoNotifications(store=>{store.sync(session.id,context.bookings,context.events);return store.list(session.id,cursor,limit);});}return notificationPage.parse(await rpc('list_notifications',{p_cursor:cursor,p_limit:limit}));}
export async function updateNotifications(action:'read'|'read_all'|'clear',id?:string){const session=await user();return session.mode==='demo'?persistDemoNotifications(store=>store.update(session.id,action,id)):rpc('update_notifications',{p_action:action,p_id:id??null});}
export async function preferences(input?:NotificationPreferences){const session=await user();if(session.mode==='demo')return persistDemoNotifications(store=>input?store.setPreferences(session.id,input):store.preferences(session.id));return notificationPreferences.parse(await rpc(input?'set_notification_preferences':'get_notification_preferences',input?{p_booking:input.bookingReminders,p_event:input.eventReminders,p_email:input.emailReminders}:{}));}
export async function requestTicketEmail(id:string,key:string){const session=await user();if(session.mode==='demo')throw new BookingError('SUPABASE_REQUIRED','Pengiriman email memerlukan mode Supabase.',409);const result=z.object({queued:z.literal(true),deliveryId:z.string().uuid()}).parse(await rpc('request_ticket_email',{p_ticket:id,p_key:key}));return {...result,message:'Permintaan kirim ulang masuk antrean.'};}
export async function deliveryHistory(id:string){const session=await user();if(session.mode==='demo')return [];return rpc('notification_deliveries',{p_ticket:id});}
