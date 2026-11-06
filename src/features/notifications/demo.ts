import { createHash,randomUUID } from 'node:crypto';
import { existsSync,readFileSync,mkdirSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { catalogRoot } from '@/features/catalog/persistence';
import type { Booking } from '@/features/booking/types';
import { BookingError } from '@/features/booking/types';
import type { ManagedEvent } from '@/features/catalog/core';
import { notificationItem,notificationPreferences,type NotificationItem,type NotificationPreferences } from './core';
const rowSchema=notificationItem.safeExtend({userId:z.string(),dedup:z.string(),dismissed:z.boolean()});
const stateSchema=z.object({rows:z.array(rowSchema),preferences:z.record(z.string(),notificationPreferences)});
export type DemoNotificationState=z.infer<typeof stateSchema>;
export class DemoNotifications {
 constructor(public state:DemoNotificationState={rows:[],preferences:{}},private clock=Date.now){}
 preferences(userId:string){return this.state.preferences[userId]??{bookingReminders:true,eventReminders:true,emailReminders:true};}
 setPreferences(userId:string,input:NotificationPreferences){this.state.preferences[userId]=input;return input;}
 sync(userId:string,bookings:Booking[],events:ManagedEvent[]){
  const now=this.clock(),pref=this.preferences(userId);
  const add=(dedup:string,title:string,message:string,type:NotificationItem['type'],link:string,date=now)=>{
   if(this.state.rows.some(r=>r.userId===userId&&r.dedup===dedup))return;
   const hex=createHash('sha256').update(userId+':'+dedup).digest('hex');const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
   this.state.rows.push({id,userId,dedup,title,message,type,link,date:new Date(date).toISOString(),read:false,dismissed:false});
  };
  for(const b of bookings){
   add('booking/'+b.id,'Reservasi dibuat','Selesaikan pembayaran sebelum batas reservasi.','booking','/bookings/'+b.id,Date.parse(b.expiresAt)-600000);
   if(b.status==='CONFIRMED')add('paid/'+b.id,'E-ticket tersedia','Pembayaran berhasil. Buka e-ticket untuk melihat QR dan detail acara.','ticket','/my-tickets');
   if(pref.bookingReminders&&b.status==='PENDING_PAYMENT'&&Date.parse(b.expiresAt)>now&&Date.parse(b.expiresAt)<=now+120000)add('reminder/'+b.id,'Reservasi segera berakhir','Selesaikan pembayaran jika ingin melanjutkan pesanan.','reminder','/bookings/'+b.id);
   const event=events.find(e=>e.slug===b.slug);
   if(pref.eventReminders&&b.status==='CONFIRMED'&&event?.status==='PUBLISHED'&&Date.parse(event.startsAt)>now&&Date.parse(event.startsAt)<=now+86400000)add('event-reminder/'+event.id+'/'+event.startsAt,'Acara akan segera dimulai','Periksa jadwal, lokasi, dan e-ticket sebelum datang.','reminder','/my-tickets');
  }
 }
 list(userId:string,cursor:string|null=null,limit=50){
  const rows=this.state.rows.filter(r=>r.userId===userId&&!r.dismissed).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  let start=0;if(cursor){const index=rows.findIndex(r=>r.id===cursor);if(index<0)throw new BookingError('NOT_FOUND','Notifikasi tidak ditemukan.',404);start=index+1;}
  const items=rows.slice(start,start+limit).map(({userId:owner,dedup,dismissed,...item})=>item);
  return {items,unreadCount:rows.filter(r=>!r.read).length,nextCursor:items.length===limit?items.at(-1)!.id:null};
 }
 update(userId:string,action:'read'|'read_all'|'clear',id?:string){
  if(action==='read'&&!this.state.rows.some(r=>r.userId===userId&&r.id===id))throw new BookingError('NOT_FOUND','Notifikasi tidak ditemukan.',404);
  for(const r of this.state.rows.filter(r=>r.userId===userId&&(action!=='read'||r.id===id))){if(action==='clear')r.dismissed=true;else r.read=true;}
  return {ok:true};
 }
}
const memory=globalThis as typeof globalThis&{summaNotifications?:DemoNotifications};
export function demoNotifications(){if(!memory.summaNotifications){const file=join(catalogRoot,'notifications.json');memory.summaNotifications=new DemoNotifications(existsSync(file)?stateSchema.parse(JSON.parse(readFileSync(file,'utf8'))):undefined);}return memory.summaNotifications;}
export function persistDemoNotifications<T>(operation:(store:DemoNotifications)=>T){const store=demoNotifications(),before=structuredClone(store.state);try{const result=operation(store);mkdirSync(catalogRoot,{recursive:true});const temp=join(catalogRoot,`notifications-${randomUUID()}.tmp`);writeFileSync(temp,JSON.stringify(store.state));renameSync(temp,join(catalogRoot,'notifications.json'));return result;}catch(e){store.state=before;throw e;}}
