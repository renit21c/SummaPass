import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { generateTicketsPdf,TICKET_QR_BOX } from '../src/features/tickets/pdf';
import { createTicketPack,decryptToken } from '../src/features/tickets/crypto';
import type { StoredTicket,Ticket } from '../src/features/tickets/types';
import { events } from '../src/features/events/data';
import { ticketPdfAttachment } from '../src/features/notifications/ticket-attachments';
import { sealEmail,openEmail } from '../src/features/notifications/payload';
import { renderEmail,sendResend } from '../src/features/notifications/email';
function sample(count=2){const key=randomBytes(32),owner=randomUUID(),booking=randomUUID();const records:StoredTicket[]=Array.from({length:count},(_,i)=>{const pack=createTicketPack('seat-'+i,key);return {id:pack.ticketId,reference:'SPT-'+pack.ticketId.replaceAll('-','').toUpperCase(),bookingId:booking,slug:events[0].slug,categoryName:'Front',seatId:pack.seatId,seatLabel:'Front A'+(i+1),attendeeName:i?'Élodie Prameswari':'Nadia Prameswari',price:175000,issuedAt:'2026-11-06T07:00:00Z',status:'ACTIVE',event:events[0],userId:owner,tokenHash:pack.tokenHash,encryptedToken:pack.encryptedToken};});return {key,records,scope:{userId:owner,bookingId:booking,ticketId:null}};}
const page=(record:StoredTicket,key:Buffer)=>{const {userId,encryptedToken,tokenHash,...ticket}=record;return {ticket:{...ticket,token:decryptToken(encryptedToken,key)} as Ticket,event:record.event!};};

test('group booking email bundles and encrypts up to 30 participant PDFs',async()=>{
 const {key,records,scope}=sample(30);const bundle=await ticketPdfAttachment(records,scope,key);
 assert.equal(bundle.ticketIds.length,30);assert.ok(Buffer.from(bundle.attachment.content,'base64').length<=1048576);
 const payload={...renderEmail({from:'x@example.test',to:'buyer@example.test',origin:'https://summapass.example',title:'Tiket Group',message:'PDF terlampir.',link:'/my-tickets'}),attachments:[bundle.attachment]};
 assert.deepEqual(openEmail(sealEmail(payload,bundle.ticketIds,key),key),payload);
 await assert.rejects(()=>ticketPdfAttachment(sample(31).records,scope,key));
});

test('PDF attachments include only owned active booking tickets and support single-ticket resend',async()=>{const {key,records,scope}=sample();const bundle=await ticketPdfAttachment(records,scope,key);assert.equal(bundle.ticketIds.length,2);const bytes=Buffer.from(bundle.attachment.content,'base64');assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');assert.equal((bytes.toString('binary').match(/\/Type \/Page\b/g)??[]).length,2);assert.ok(bytes.toString('binary').includes('/FontFile2'));assert.ok(bytes.length<1048576);assert.equal(bundle.attachment.content_type,'application/pdf');assert.match(bundle.attachment.filename,/^SummaPass-[a-zA-Z0-9_-]+\.pdf$/);
 const single=await ticketPdfAttachment([records[1]],{...scope,ticketId:records[1].id},key);assert.equal(single.ticketIds.length,1);
 for(const bad of [[{...records[0],userId:randomUUID()}],[{...records[0],bookingId:randomUUID()}],[{...records[0],status:'REVOKED' as const}],[{...records[0],event:undefined}],[{...records[0],tokenHash:'0'.repeat(64)}],[records[0],records[0]],[]])await assert.rejects(()=>ticketPdfAttachment(bad,scope,key));
 await assert.rejects(()=>ticketPdfAttachment(records,{...scope,ticketId:records[0].id},key));
});

test('frozen PDF email is encrypted, authenticated, immutable across retries and compatible with legacy mail',async()=>{const {key,records,scope}=sample();const bundle=await ticketPdfAttachment(records,scope,key);const payload={...renderEmail({from:'SummaPass <onboarding@resend.dev>',to:'buyer@example.test',origin:'https://summapass.example',title:'E-ticket tersedia',message:'PDF terlampir.',link:'/my-tickets'}),attachments:[bundle.attachment]};const sealed=sealEmail(payload,bundle.ticketIds,key);assert.ok('version' in sealed);const stored=JSON.stringify(sealed);assert.ok(!stored.includes(bundle.attachment.content.slice(0,100)));assert.ok(!stored.includes('buyer@example.test'));assert.deepEqual(openEmail(sealed,key),payload);assert.throws(()=>openEmail(sealed,randomBytes(32)));if('version' in sealed){assert.throws(()=>openEmail({...sealed,ticketIds:[randomUUID()]},key));}
 const requests:string[]=[];const transport=(async(_:unknown,init:RequestInit)=>{requests.push(String(init.body));return new Response(JSON.stringify({id:'test-provider'}),{status:200});}) as typeof fetch;
 assert.equal((await sendResend(openEmail(sealed,key),'pdf-job','test-only',transport)).status,'SENT');await sendResend(openEmail(sealed,key),'pdf-job','test-only',transport);assert.equal(requests[0],requests[1]);assert.deepEqual(openEmail(payload,key),payload);
});

const canRender=spawnSync('pdftoppm',['-v'],{encoding:'utf8'}).status===0;
test('rendered A4 PDFs decode to the real QR token and preserve Unicode text on each page',{skip:!canRender},async()=>{const {key,records}=sample();const directory=mkdtempSync(join(tmpdir(),'summapass-ticket-pdf-'));try{
 const bytes=await generateTicketsPdf(records.map(r=>page(r,key)));const input=join(directory,'tickets.pdf');writeFileSync(input,bytes);const rendered=spawnSync('pdftoppm',['-r','144','-png',input,join(directory,'page')],{encoding:'utf8'});assert.equal(rendered.status,0,rendered.stderr);
 for(let i=0;i<records.length;i++){const image=readFileSync(join(directory,`page-${i+1}.png`));const crop=await sharp(image).extract({left:TICKET_QR_BOX.x*2,top:TICKET_QR_BOX.y*2,width:TICKET_QR_BOX.size*2,height:TICKET_QR_BOX.size*2}).ensureAlpha().raw().toBuffer({resolveWithObject:true});const decoded=jsQR(new Uint8ClampedArray(crop.data),crop.info.width,crop.info.height);assert.equal(decoded?.data,decryptToken(records[i].encryptedToken,key));}
 const extracted=spawnSync('pdftotext',[input,'-'],{encoding:'utf8'});if(!extracted.error){assert.equal(extracted.status,0);assert.ok(extracted.stdout.includes('Élodie Prameswari'));assert.ok(extracted.stdout.includes('Senja di Summa'));assert.ok(extracted.stdout.includes(records[1].reference));}
 }finally{rmSync(directory,{recursive:true,force:true});}});
