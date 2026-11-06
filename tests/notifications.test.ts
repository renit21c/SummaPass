import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { catalogDb,asUser,actors,newEvent } from './helpers/catalog-db';
import { sealEmail } from '../src/features/notifications/payload';
import { ticketPdfAttachment } from '../src/features/notifications/ticket-attachments';
import type { StoredTicket } from '../src/features/tickets/types';
import { createTicketPack } from '../src/features/tickets/crypto';
import { renderEmail,sendResend } from '../src/features/notifications/email';
import { validCronAuthorization } from '../src/features/notifications/cron-auth';
import { DemoNotifications } from '../src/features/notifications/demo';
import type { Booking,Inventory } from '../src/features/booking/types';
import type { NotificationItem } from '../src/features/notifications/core';

type Job={id:string;leaseToken:string};
type Page={items:NotificationItem[];unreadCount:number;nextCursor:string|null};
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:T}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x))).rows[0].r;}
async function worker(db:PGlite){await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role service_role");}
async function setup(db:PGlite){await asUser(db,actors.organizer);const e=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,newEvent()]);await rpc(db,'manage_event',['publish',e.id,{}]);await asUser(db,actors.buyer);const inv=await rpc<Inventory>(db,'seat_inventory',[e.slug]);const c=inv.categories[0],s=inv.seats.find(s=>s.status==='AVAILABLE'&&c.sections.includes(s.section))!;const key=randomUUID();const b=await rpc<Booking>(db,'reserve_booking',[e.slug,c.id,[{seatId:s.id,name:'Peserta'}],key]);return {e,b,key,c,s};}
async function pay(db:PGlite,b:Booking){await worker(db);const packs=b.items.map(i=>createTicketPack(i.seatId,randomBytes(32)));return rpc(db,'process_simulated_payment',[actors.buyer,b.id,'success',packs]);}
async function kind(db:PGlite,job:Job){await db.exec('reset role');const r=await db.query<{kind:string}>("select n.kind from public.notifications n join public.notification_outbox o on o.notification_id=n.id where o.id=$1",[job.id]);await worker(db);return r.rows[0].kind;}

test('email rendering escapes event text, uses authenticated links and rejects unsafe origins',async()=>{
 const payload=renderEmail({from:'SummaPass <hello@example.test>',to:'buyer@example.test',origin:'https://summapass.example',title:'<script>x</script>',message:'A & B <img src=x>',link:'/my-tickets'});
 assert.ok(payload.html.includes('&lt;script&gt;'));assert.ok(!payload.html.includes('<script>'));assert.ok(payload.html.includes('https://summapass.example/my-tickets'));assert.ok(!payload.html.includes('token='));
 for(const origin of ['javascript:alert(1)','https://user:pass@example.test','https://example.test/path'])assert.throws(()=>renderEmail({from:'x@y.test',to:'a@b.test',origin,title:'Tiket',message:'',link:'/my-tickets'}));
 assert.throws(()=>renderEmail({from:'x@y.test',to:'a@b.test',origin:'https://safe.test',title:'Tiket',message:'',link:'//evil.test'}));
 const requests:{body:string;key:string}[]=[];
 const transport=(async(_:unknown,init:RequestInit)=>{requests.push({body:String(init.body),key:new Headers(init.headers).get('Idempotency-Key')!});return new Response(JSON.stringify({id:'provider-id'}),{status:200});}) as typeof fetch;
 assert.equal((await sendResend(payload,'job-1','test-only',transport)).status,'SENT');await sendResend(payload,'job-1','test-only',transport);assert.deepEqual(requests[0],requests[1]);
 for(const status of [429,500,400,401]){const response=await sendResend(payload,'job-2','test-only',(async()=>new Response('{}',{status})) as typeof fetch);assert.equal(response.status,status>=500||status===429?'RETRY':'FAILED');}
 for(const name of ['concurrent_idempotent_requests','invalid_idempotent_request']){const result=await sendResend(payload,'job-3','test-only',(async()=>new Response(JSON.stringify({name}),{status:409})) as typeof fetch);assert.equal(result.status,name==='concurrent_idempotent_requests'?'RETRY':'FAILED');}
 const timeout=await sendResend(payload,'job-2','test-only',(async()=>{throw Error('network');}) as typeof fetch);assert.deepEqual(timeout,{status:'RETRY',error:'PROVIDER_UNREACHABLE'});
});

test('cron authentication fails closed and compares the complete bearer value',()=>{const secret='a'.repeat(40);assert.equal(validCronAuthorization('Bearer '+secret,secret),true);for(const header of [null,secret,'Bearer '+secret+'x','Bearer wrong'])assert.equal(validCronAuthorization(header,secret),false);assert.equal(validCronAuthorization('Bearer short','short'),false);assert.equal(validCronAuthorization('Bearer '+secret,undefined),false);});

test('demo notifications are derived from real bookings, scoped, persistent and deduplicated',()=>{const now=Date.parse('2026-11-06T10:00:00Z');const store=new DemoNotifications(undefined,()=>now);const b:Booking={id:randomUUID(),reference:'QA',slug:'test',userId:'buyer',categoryId:'vip',categoryName:'VIP',status:'PENDING_PAYMENT',expiresAt:new Date(now+90000).toISOString(),total:100,items:[]};store.sync('buyer',[b],[]);store.sync('buyer',[b],[]);assert.equal(store.list('buyer').items.length,2);assert.equal(store.list('other').items.length,0);assert.throws(()=>store.update('other','read',store.list('buyer').items[0].id));store.update('buyer','read_all');const restored=new DemoNotifications(structuredClone(store.state),()=>now);assert.equal(restored.list('buyer').unreadCount,0);restored.update('buyer','clear');restored.sync('buyer',[b],[]);assert.equal(restored.list('buyer').items.length,0);restored.sync('buyer',[{...b,status:'CONFIRMED'}],[]);assert.equal(restored.list('buyer').items[0].type,'ticket');});

test('transactional notifications and email queue preserve payment idempotency and owner RLS',async()=>{const db=await catalogDb();try{
 const {e,b,key,c,s}=await setup(db);let page=await rpc<Page>(db,'list_notifications');assert.equal(page.items.length,1);assert.equal(page.items[0].type,'booking');
 await rpc(db,'reserve_booking',[e.slug,c.id,[{seatId:s.id,name:'Peserta'}],key]);assert.equal((await rpc<Page>(db,'list_notifications')).items.length,1);
 await asUser(db,actors.other);assert.equal((await rpc<Page>(db,'list_notifications')).items.length,0);assert.equal((await db.query('select * from public.notifications')).rows.length,0);assert.equal((await rpc(db,'update_notifications',['read',page.items[0].id])).error,'NOT_FOUND');await assert.rejects(()=>db.query('select * from public.notification_outbox'));await assert.rejects(()=>rpc(db,'claim_notification_emails',[5]));
 await asUser(db,actors.staff);assert.equal((await rpc<Page>(db,'list_notifications')).items.length,0);await assert.rejects(()=>rpc(db,'enqueue_due_notifications'));
 await asUser(db);await assert.rejects(()=>rpc(db,'list_notifications'));await assert.rejects(()=>rpc(db,'enqueue_notification',[actors.buyer,e.id,b.id,'TICKET_READY','fake','fake','fake','/my-tickets']));
 await pay(db,b);await pay(db,b);await asUser(db,actors.buyer);page=await rpc<Page>(db,'list_notifications');assert.equal(page.items.length,2);assert.equal(page.items.filter(i=>i.type==='ticket').length,1);await rpc(db,'update_notifications',['read_all']);assert.equal((await rpc<Page>(db,'list_notifications')).unreadCount,0);
 await worker(db);let jobs=await rpc<Job[]>(db,'claim_notification_emails',[5]);assert.equal(jobs.length,1);const job=jobs[0];const context=await rpc(db,'notification_email_context',[job.id,job.leaseToken]);assert.equal(context.userId,actors.buyer);assert.equal(context.link,'/my-tickets');assert.ok(!JSON.stringify(context).includes('encryptedToken'));assert.ok(!JSON.stringify(context).includes('tokenHash'));
 await rpc(db,'finish_notification_email',[job.id,job.leaseToken,'RETRY','PROVIDER_HTTP_500',null]);await asUser(db,actors.buyer);assert.equal((await rpc<Booking>(db,'get_booking',[b.id])).status,'CONFIRMED');
 await worker(db);assert.deepEqual(await rpc(db,'claim_notification_emails',[5]),[]);await db.exec('reset role');await db.query("update public.notification_outbox set next_attempt_at=clock_timestamp()-interval '1 second'");await worker(db);jobs=await rpc<Job[]>(db,'claim_notification_emails',[5]);assert.equal(jobs.length,1);assert.equal(await rpc(db,'finish_notification_email',[job.id,job.leaseToken,'SENT',null,'stale']),false);assert.equal(await rpc(db,'finish_notification_email',[jobs[0].id,jobs[0].leaseToken,'SENT',null,'provider']),true);assert.deepEqual(await rpc(db,'claim_notification_emails',[5]),[]);
 }finally{await db.close();}});

test('ticket resend is owned, idempotent, rate limited and exposes safe delivery history',async()=>{const db=await catalogDb();try{
 const {b}=await setup(db);await pay(db,b);await db.exec('reset role');const ticket=(await db.query<{id:string}>('select id from public.tickets')).rows[0].id;
 await asUser(db,actors.other);assert.equal((await rpc(db,'request_ticket_email',[ticket,randomUUID()])).error,'NOT_FOUND');assert.deepEqual(await rpc(db,'notification_deliveries',[ticket]),[]);
 await asUser(db,actors.buyer);const key=randomUUID();const queued=await rpc(db,'request_ticket_email',[ticket,key]);assert.equal(queued.queued,true);assert.equal((await rpc(db,'request_ticket_email',[ticket,key])).deliveryId,queued.deliveryId);assert.equal((await rpc(db,'request_ticket_email',[ticket,randomUUID()])).error,'RATE_LIMIT');const history=await rpc<unknown[]>(db,'notification_deliveries',[ticket]);assert.equal(history.length,2);assert.ok(!JSON.stringify(history).includes('delivery_payload'));
 await db.exec('reset role');for(let i=0;i<4;i++){await db.query("update public.notifications set created_at=clock_timestamp()-interval '2 minutes' where kind='TICKET_RESEND'");await asUser(db,actors.buyer);assert.equal((await rpc(db,'request_ticket_email',[ticket,randomUUID()])).queued,true);await db.exec('reset role');}
 await db.query("update public.notifications set created_at=clock_timestamp()-interval '2 minutes' where kind='TICKET_RESEND'");await asUser(db,actors.buyer);assert.equal((await rpc(db,'request_ticket_email',[ticket,randomUUID()])).error,'RATE_LIMIT');
 }finally{await db.close();}});

test('reminders revalidate payment, expiry, preferences, ticket revocation and event rescheduling',async()=>{const db=await catalogDb();try{
 const {b,e}=await setup(db);await db.exec('reset role');await db.query("update public.bookings set expires_at=clock_timestamp()+interval '90 seconds' where id=$1",[b.id]);await worker(db);assert.equal(await rpc(db,'enqueue_due_notifications'),1);assert.equal(await rpc(db,'enqueue_due_notifications'),0);let jobs=await rpc<Job[]>(db,'claim_notification_emails',[5]);assert.equal(jobs.length,1);assert.equal((await rpc(db,'notification_email_context',[jobs[0].id,jobs[0].leaseToken])).isReminder,true);
 await pay(db,b);assert.equal((await rpc(db,'notification_email_context',[jobs[0].id,jobs[0].leaseToken])).skip,'NO_LONGER_ELIGIBLE');await rpc(db,'finish_notification_email',[jobs[0].id,jobs[0].leaseToken,'SKIPPED','NO_LONGER_ELIGIBLE',null]);
 await db.exec('reset role');await db.query("update public.events set starts_at=clock_timestamp()+interval '12 hours',ends_at=clock_timestamp()+interval '15 hours' where id=$1",[e.id]);await worker(db);assert.equal(await rpc(db,'enqueue_due_notifications'),1);assert.equal(await rpc(db,'enqueue_due_notifications'),0);jobs=await rpc<Job[]>(db,'claim_notification_emails',[5]);let reminder:Job|undefined;for(const job of jobs){if(await kind(db,job)==='EVENT_REMINDER')reminder=job;}assert.ok(reminder);
 await asUser(db,actors.buyer);await rpc(db,'set_notification_preferences',[true,false,false]);await worker(db);assert.equal((await rpc(db,'notification_email_context',[reminder.id,reminder.leaseToken])).skip,'PREFERENCE_DISABLED');await asUser(db,actors.buyer);await rpc(db,'set_notification_preferences',[true,true,true]);await worker(db);assert.equal((await rpc(db,'notification_email_context',[reminder.id,reminder.leaseToken])).skip,undefined);
 await db.exec('reset role');await db.query("update public.events set starts_at=starts_at+interval '1 hour',ends_at=ends_at+interval '1 hour' where id=$1",[e.id]);await worker(db);assert.equal((await rpc(db,'notification_email_context',[reminder.id,reminder.leaseToken])).skip,'NO_LONGER_ELIGIBLE');
 await db.exec('reset role');await db.query("update public.tickets set status='REVOKED'");await worker(db);for(const job of jobs){assert.equal((await rpc(db,'notification_email_context',[job.id,job.leaseToken])).skip,'NO_LONGER_ELIGIBLE');}
 }finally{await db.close();}});

test('email leases, immutable payload, retry cap and 23 hour boundary prevent unsafe replay',async()=>{const db=await catalogDb();try{
 const {b}=await setup(db);await pay(db,b);let job=(await rpc<Job[]>(db,'claim_notification_emails',[5]))[0];assert.ok(job);
 const payload=renderEmail({from:'x@y.test',to:'buyer@example.test',origin:'https://summapass.example',title:'Tiket',message:'Pesan',link:'/my-tickets'});
 assert.deepEqual(await rpc(db,'prepare_notification_email',[job.id,job.leaseToken,payload]),payload);assert.deepEqual(await rpc(db,'prepare_notification_email',[job.id,job.leaseToken,{...payload,subject:'Changed'}]),payload);
 assert.equal((await rpc(db,'notification_email_context',[job.id,randomUUID()])).skip,'LEASE_LOST');
 await db.exec('reset role');await db.query("update public.notification_outbox set lease_until=clock_timestamp()-interval '1 second'");await worker(db);const reclaimed=(await rpc<Job[]>(db,'claim_notification_emails',[5]))[0];assert.notEqual(reclaimed.leaseToken,job.leaseToken);assert.equal(await rpc(db,'finish_notification_email',[job.id,job.leaseToken,'SENT',null,'stale']),false);job=reclaimed;
 for(let attempt=2;attempt<=5;attempt++){await rpc(db,'finish_notification_email',[job.id,job.leaseToken,'RETRY','PROVIDER_UNREACHABLE',null]);await db.exec('reset role');await db.query("update public.notification_outbox set next_attempt_at=clock_timestamp()-interval '1 second'");await worker(db);const next=await rpc<Job[]>(db,'claim_notification_emails',[5]);if(attempt===5)assert.deepEqual(next,[]);else job=next[0];}
 await db.exec('reset role');assert.equal((await db.query<{status:string}>('select status from public.notification_outbox')).rows[0].status,'FAILED');await db.query("update public.notification_outbox set status='RETRY',attempts=1,first_attempt_at=clock_timestamp()-interval '24 hours'");await worker(db);assert.deepEqual(await rpc(db,'claim_notification_emails',[5]),[]);await db.exec('reset role');assert.equal((await db.query<{last_error:string}>('select last_error from public.notification_outbox')).rows[0].last_error,'RETRY_WINDOW_EXCEEDED');
 }finally{await db.close();}});


test('PDF email RPC scopes attachment records and skips a frozen bundle when a ticket is revoked',async()=>{const db=await catalogDb();try{
 const {e,c}=await setup(db);await asUser(db,actors.buyer);const inv=await rpc<Inventory>(db,'seat_inventory',[e.slug]);const available=inv.seats.filter(s=>s.status==='AVAILABLE'&&c.sections.includes(s.section)).slice(0,2);
 const b=await rpc<Booking>(db,'reserve_booking',[e.slug,c.id,available.map(s=>({seatId:s.id,name:'PDF Uji'})),randomUUID()]);const key=randomBytes(32);await worker(db);await rpc(db,'process_simulated_payment',[actors.buyer,b.id,'success',b.items.map(i=>createTicketPack(i.seatId,key))]);const job=(await rpc<Job[]>(db,'claim_notification_emails',[5]))[0];
 assert.equal((await rpc(db,'notification_pdf_configuration')).version,2);const context=await rpc(db,'notification_email_context',[job.id,job.leaseToken]);assert.equal(context.kind,'TICKET_READY');assert.equal(context.bookingId,b.id);
 const records=await rpc<StoredTicket[]>(db,'notification_attachment_tickets',[job.id,job.leaseToken]);assert.equal(records.length,2);assert.ok(records.every(t=>t.userId===actors.buyer&&t.bookingId===b.id&&t.status==='ACTIVE'));const attachment=await ticketPdfAttachment(records,{userId:actors.buyer,bookingId:b.id,ticketId:null},key);
 const payload={...renderEmail({from:'x@y.test',to:'buyer@example.test',origin:'https://summapass.example',title:'PDF',message:'Tiket terlampir',link:'/my-tickets'}),attachments:[attachment.attachment]};const frozen=sealEmail(payload,attachment.ticketIds,key);assert.deepEqual(await rpc(db,'prepare_notification_email',[job.id,job.leaseToken,frozen]),frozen);assert.equal((await rpc(db,'notification_email_context',[job.id,job.leaseToken])).skip,undefined);
 await asUser(db,actors.staff);await assert.rejects(()=>rpc(db,'notification_attachment_tickets',[job.id,job.leaseToken]));await asUser(db,actors.buyer);await assert.rejects(()=>rpc(db,'notification_pdf_configuration'));await db.exec('reset role');await db.query("update public.tickets set status='REVOKED' where id=$1",[records[0].id]);await worker(db);assert.equal((await rpc(db,'notification_email_context',[job.id,job.leaseToken])).skip,'ATTACHED_TICKET_INACTIVE');
 }finally{await db.close();}});
