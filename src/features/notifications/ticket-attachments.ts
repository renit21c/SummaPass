import type { StoredTicket,Ticket } from '@/features/tickets/types';
import { decryptToken,tokenHash } from '@/features/tickets/crypto';
import { generateTicketsPdf } from '@/features/tickets/pdf';
import type { EmailAttachment } from './email';
export async function ticketPdfAttachment(records:StoredTicket[],scope:{userId:string;bookingId:string;ticketId:string|null},key:Buffer):Promise<{attachment:EmailAttachment;ticketIds:string[]}>{
 if(records.length<1||records.length>30)throw Error('ATTACHMENT_TICKET_COUNT');
 if(new Set(records.map(t=>t.id)).size!==records.length)throw Error('ATTACHMENT_DUPLICATE');
 const pages=records.map(record=>{
  if(record.userId!==scope.userId||record.bookingId!==scope.bookingId||record.status!=='ACTIVE'||(scope.ticketId&&record.id!==scope.ticketId))throw Error('ATTACHMENT_TICKET_SCOPE');
  if(!record.event)throw Error('ATTACHMENT_EVENT_MISSING');
  const token=decryptToken(record.encryptedToken,key);if(tokenHash(token)!==record.tokenHash)throw Error('ATTACHMENT_TOKEN_MISMATCH');
  const {userId,encryptedToken,tokenHash:hash,...fields}=record;
  const ticket:Ticket={...fields,token};return {ticket,event:record.event};
 });
 const bytes=await generateTicketsPdf(pages);if(bytes.length>1048576)throw Error('ATTACHMENT_TOO_LARGE');
 const label=scope.ticketId?records[0].reference:scope.bookingId;
 const filename=`SummaPass-${label.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)}.pdf`;
 return {attachment:{filename,content:bytes.toString('base64'),content_type:'application/pdf'},ticketIds:records.map(r=>r.id).sort()};
}
