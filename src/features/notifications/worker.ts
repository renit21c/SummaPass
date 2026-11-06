import 'server-only';
import { z } from 'zod';
import { notificationAdmin } from './admin';
import { emailPayload,renderEmail,sendResend } from './email';
import { storedEmailPayload,sealEmail,openEmail } from './payload';
import { ticketPdfAttachment } from './ticket-attachments';
import type { StoredTicket } from '@/features/tickets/types';
import { authMode } from '@/lib/auth/config';
import { BookingError } from '@/features/booking/types';
const jobSchema=z.object({id:z.string().uuid(),leaseToken:z.string().uuid(),attempts:z.number().int()});
const contextSchema=z.object({userId:z.string().uuid(),kind:z.string(),bookingId:z.string().uuid(),ticketId:z.string().uuid().nullable(),title:z.string(),message:z.string(),link:z.string(),isReminder:z.boolean(),payload:storedEmailPayload.nullable()});
export async function runNotifications(){
 if(authMode()!=='supabase')throw new BookingError('SUPABASE_REQUIRED','Worker memerlukan mode Supabase.',409);
 const admin=notificationAdmin();
 async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await admin.rpc(name,args);if(error)throw new BookingError('DATABASE','Antrean notifikasi belum dapat diproses.',503);return data as unknown;}
 const scheduled=await rpc('enqueue_due_notifications');
 const enabled=process.env.SUMMAPASS_EMAIL_ENABLED==='true',key=process.env.RESEND_API_KEY,from=process.env.SUMMAPASS_EMAIL_FROM,origin=process.env.SUMMAPASS_APP_URL;
 if(!enabled||!key||!from||!origin)return {scheduled,emailEnabled:false,processed:0};
 // Validate configuration before claiming anything; never spend retries on missing config.
 renderEmail({from,to:'configuration@example.test',origin,title:'Configuration',message:'',link:'/my-tickets'});
 const configuration=await admin.rpc('notification_pdf_configuration');
 if(configuration.error||configuration.data?.version!==2)throw new BookingError('MIGRATION_REQUIRED','Terapkan migrasi 012 sebelum memproses email PDF.',503);
 const keyHex=process.env.SUMMAPASS_TICKET_KEY_V1;
 if(!keyHex||!/^[a-fA-F0-9]{64}$/.test(keyHex))throw new BookingError('CONFIGURATION','Kunci tiket belum dikonfigurasi.',503);
 const ticketKey=Buffer.from(keyHex,'hex');
 const jobs=z.array(jobSchema).parse(await rpc('claim_notification_emails',{p_limit:5}));
 const counts={sent:0,retry:0,failed:0,skipped:0,leaseLost:0};
 for(const job of jobs){
  const args={p_job:job.id,p_lease:job.leaseToken};
  async function finish(status:string,error:string|null=null,provider:string|null=null){const applied=await rpc('finish_notification_email',{...args,p_status:status,p_error:error,p_provider:provider});if(!applied)counts.leaseLost++;else if(status==='SENT')counts.sent++;else if(status==='RETRY'&&job.attempts<5)counts.retry++;else if(status==='FAILED'||status==='RETRY')counts.failed++;else counts.skipped++;}
  try{
   let raw=await rpc('notification_email_context',args);
   const skipped=z.object({skip:z.string()}).safeParse(raw);if(skipped.success){if(skipped.data.skip==='LEASE_LOST')counts.leaseLost++;else await finish('SKIPPED',skipped.data.skip);continue;}
   const context=contextSchema.parse(raw);
   const {data,error}=await admin.auth.admin.getUserById(context.userId);
   if(error){await finish('RETRY','RECIPIENT_LOOKUP_FAILED');continue;}
   const user=data.user;
   if(!user?.email||!user.email_confirmed_at){await finish('SKIPPED','VERIFIED_EMAIL_REQUIRED');continue;}
   if(context.isReminder&&user.user_metadata?.preferences?.emailNotify===false){await finish('SKIPPED','PREFERENCE_DISABLED');continue;}
   const existing=context.payload?openEmail(context.payload,ticketKey):null;
   if(existing&&existing.to[0].toLowerCase()!==user.email.toLowerCase()){await finish('SKIPPED','RECIPIENT_CHANGED');continue;}
   let prepared=context.payload;
   if(!prepared){
    const candidate=renderEmail({from,to:user.email,origin,title:context.title,message:context.message,link:context.link});
    let ticketIds:string[]=[];
    if(context.kind==='TICKET_READY'||context.kind==='TICKET_RESEND'){
     const rows=await rpc('notification_attachment_tickets',args);
     if(!Array.isArray(rows))throw Error('ATTACHMENT_FETCH_FAILED');
     const bundle=await ticketPdfAttachment(rows as StoredTicket[],{userId:context.userId,bookingId:context.bookingId,ticketId:context.ticketId},ticketKey);
     candidate.attachments=[bundle.attachment];ticketIds=bundle.ticketIds;
     candidate.text+='\n\nPDF e-ticket terlampir. Cetak pada kertas A4 dengan skala 100%.';
     candidate.html=candidate.html.replace('</h1>','</h1><p style="padding:14px;background:#ffe044;border:1px solid #252525;border-radius:8px">PDF e-ticket terlampir dan siap dicetak pada kertas A4, skala 100%.</p>');
    }
    const sealed=sealEmail(emailPayload.parse(candidate),ticketIds,ticketKey);
    prepared=storedEmailPayload.parse(await rpc('prepare_notification_email',{...args,p_payload:sealed}));
   }
   const payload=openEmail(prepared,ticketKey);
   // Recheck transactional state immediately before the network call, including retries.
   raw=await rpc('notification_email_context',args);const latest=z.object({skip:z.string()}).safeParse(raw);
   if(latest.success){if(latest.data.skip==='LEASE_LOST')counts.leaseLost++;else await finish('SKIPPED',latest.data.skip);continue;}
   const result=await sendResend(payload,job.id,key);
   if(result.status==='SENT')await finish('SENT',null,result.providerId);else await finish(result.status,result.error);
  }catch(e){if(e instanceof BookingError)throw e;await finish('RETRY','WORKER_PROCESSING_FAILED');}
 }
 return {scheduled,emailEnabled:true,processed:jobs.length,...counts};
}
