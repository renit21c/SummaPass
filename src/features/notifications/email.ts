import { z } from 'zod';
export const emailAttachment=z.object({filename:z.string().regex(/^[a-zA-Z0-9_-]+\.pdf$/).max(120),content:z.string().min(1).max(1398104).regex(/^[A-Za-z0-9+/]+={0,2}$/),content_type:z.literal('application/pdf')});
export type EmailAttachment=z.infer<typeof emailAttachment>;
export const emailPayload=z.object({from:z.string().min(3).max(300),to:z.array(z.string().email()).length(1),subject:z.string().min(1).max(200),text:z.string().max(12000),html:z.string().max(32000),attachments:z.array(emailAttachment).max(1).optional()});
export type EmailPayload=z.infer<typeof emailPayload>;
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
const emailColors={orange:'#ff681c',purple:'#6632cf',yellow:'#ffe044',mint:'#51e3ab',pink:'#ff7ac3',paper:'#f0f1f3',ink:'#24221f',muted:'#60564d',white:'#ffffff'};
export function renderEmail(input:{from:string;to:string;origin:string;title:string;message:string;link:string;ticketPdf?:boolean}):EmailPayload{
 const origin=new URL(input.origin);
 if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('APP_URL_INVALID');
 if(!input.link.startsWith('/')||input.link.startsWith('//')||input.link.includes('\\'))throw new Error('LINK_INVALID');
 const url=new URL(input.link,origin);if(url.origin!==origin.origin)throw new Error('LINK_INVALID');
 const c=emailColors,href=escapeHtml(url.href),home=escapeHtml(origin.href);
 const title=escapeHtml(input.title),message=escapeHtml(input.message).replace(/\r?\n/g,'<br>');
 const year=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date());
 const copyright=`© ${year} SummaPass. Seluruh hak cipta dilindungi.`;
 const action=url.pathname.startsWith('/staff/invitations/')?'Lihat undangan':url.pathname.startsWith('/my-tickets')?'Lihat e-ticket':url.pathname.startsWith('/bookings')?'Lihat pesanan':'Buka SummaPass';
 const pdfText='PDF e-ticket terlampir. Cetak pada kertas A4 dengan skala 100%.';
 const pdf=input.ticketPdf?`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td bgcolor="${c.mint}" style="padding:18px 20px;border:2px solid ${c.ink};border-radius:12px;color:${c.ink};font-size:14px;line-height:1.7"><strong style="font-size:16px">PDF e-ticket terlampir</strong><br>Cetak pada kertas A4 dengan skala 100%.</td></tr></table>`:'';
 const html=`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:16px 10px!important}.email-pad{padding:24px 20px!important}.email-title{font-size:28px!important}}</style></head>
<body style="margin:0;padding:0;background:${c.paper};color:${c.ink};font-family:'Plus Jakarta Sans',Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;mso-hide:all">${escapeHtml(input.message.slice(0,140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.paper}"><tr><td class="email-outer" align="center" style="padding:36px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border:2px solid ${c.ink};border-radius:20px;background:${c.white};overflow:hidden">
<tr><td class="email-pad" bgcolor="${c.orange}" style="padding:28px 32px;border-radius:17px 17px 0 0;border-bottom:2px solid ${c.ink}"><a href="${home}" style="color:${c.ink};font-size:32px;line-height:1.2;font-weight:800;letter-spacing:-1px;text-decoration:none">SummaPass<span style="color:${c.white}">.</span></a></td></tr>
<tr><td class="email-pad" style="padding:32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${c.yellow}" style="padding:26px 24px;border:2px solid ${c.ink};border-radius:14px">
<h1 class="email-title" style="font-size:32px;line-height:1.25;letter-spacing:-.7px;margin:0 0 18px;font-weight:800;overflow-wrap:anywhere">${title}</h1>
<p style="font-size:16px;line-height:1.8;margin:0;overflow-wrap:anywhere">${message}</p>
</td></tr></table>
${pdf}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 20px"><tr><td bgcolor="${c.purple}" style="border:2px solid ${c.ink};border-radius:10px;text-align:center"><a href="${href}" style="display:inline-block;padding:16px 26px;color:${c.white};font-size:16px;line-height:1.4;font-weight:700;text-decoration:none;border-radius:8px">${action}</a></td></tr></table>
<p style="font-size:13px;line-height:1.7;margin:0 0 18px;color:${c.muted}">Masuk dengan email penerima untuk melanjutkan.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:18px 0 0;border-top:2px dashed ${c.ink}"><p style="font-size:12px;line-height:1.7;margin:0 0 6px;color:${c.muted}">Jika tombol tidak berfungsi, buka tautan ini:</p><a href="${href}" style="font-size:12px;line-height:1.7;color:${c.purple};word-break:break-all;text-decoration:underline">${href}</a></td></tr></table>
</td></tr>
<tr><td><table role="presentation" aria-hidden="true" width="100%" cellpadding="0" cellspacing="0"><tr><td width="25%" height="10" bgcolor="${c.purple}" style="font-size:0;line-height:0">&nbsp;</td><td width="25%" height="10" bgcolor="${c.pink}" style="font-size:0;line-height:0">&nbsp;</td><td width="25%" height="10" bgcolor="${c.mint}" style="font-size:0;line-height:0">&nbsp;</td><td width="25%" height="10" bgcolor="${c.yellow}" style="font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" bgcolor="${c.paper}" style="padding:24px 20px;border-top:2px solid ${c.ink};border-radius:0 0 17px 17px"><p style="margin:0 0 8px;font-weight:800;font-size:18px;color:${c.ink}">SummaPass</p><p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:${c.muted}">${copyright}</p><p style="margin:0;font-size:12px;line-height:1.7;color:${c.muted}">Email otomatis. Jangan membalas email ini.</p></td></tr>
</table></td></tr></table></body></html>`;
 return emailPayload.parse({from:input.from,to:[input.to],subject:input.title.replace(/[\r\n]/g,' ').slice(0,200),text:`${input.title}\n\n${input.message}${input.ticketPdf?'\n\n'+pdfText:''}\n\n${action}: ${url.href}\nMasuk dengan email penerima untuk melanjutkan.\n\n${copyright}\nEmail otomatis. Jangan membalas email ini.`,html});
}
export type SendResult={status:'SENT';providerId:string}|{status:'RETRY'|'FAILED';error:string};
export async function sendResend(payload:EmailPayload,jobId:string,apiKey:string,transport:typeof fetch=fetch):Promise<SendResult>{
 try{
 const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`summapass/${jobId}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 if(response.status===409){const detail=z.object({name:z.string()}).safeParse(await response.json());return {status:detail.success&&detail.data.name==='concurrent_idempotent_requests'?'RETRY':'FAILED',error:'PROVIDER_HTTP_409'};}
 if(!response.ok){const retry=response.status===408||response.status===429||response.status>=500;return {status:retry?'RETRY':'FAILED',error:`PROVIDER_HTTP_${response.status}`};}
 const parsed=z.object({id:z.string().min(1).max(100)}).safeParse(await response.json());return parsed.success?{status:'SENT',providerId:parsed.data.id}:{status:'RETRY',error:'PROVIDER_RESPONSE_INVALID'};
 }catch{return {status:'RETRY',error:'PROVIDER_UNREACHABLE'};}
}
