import { z } from 'zod';
export const emailAttachment=z.object({filename:z.string().regex(/^[a-zA-Z0-9_-]+\.pdf$/).max(120),content:z.string().min(1).max(1398104).regex(/^[A-Za-z0-9+/]+={0,2}$/),content_type:z.literal('application/pdf')});
export type EmailAttachment=z.infer<typeof emailAttachment>;
export const emailPayload=z.object({from:z.string().min(3).max(300),to:z.array(z.string().email()).length(1),subject:z.string().min(1).max(200),text:z.string().max(12000),html:z.string().max(12000),attachments:z.array(emailAttachment).max(1).optional()});
export type EmailPayload=z.infer<typeof emailPayload>;
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function renderEmail(input:{from:string;to:string;origin:string;title:string;message:string;link:string}):EmailPayload{
 const origin=new URL(input.origin);
 if(!['https:','http:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('APP_URL_INVALID');
 if(!input.link.startsWith('/')||input.link.startsWith('//')||input.link.includes('\\'))throw new Error('LINK_INVALID');
 const url=new URL(input.link,origin);if(url.origin!==origin.origin)throw new Error('LINK_INVALID');
 const html=`<div style="background:#fff9f2;padding:28px;font-family:Arial,sans-serif;color:#252525"><div style="max-width:560px;margin:auto;border:2px solid #252525;border-radius:16px;overflow:hidden;background:#fff9f2"><div style="padding:24px;background:#ff681c;border-bottom:2px solid #252525;font-size:28px;font-weight:800">SummaPass</div><div style="padding:28px"><h1 style="font-size:24px;line-height:1.3;margin:0 0 16px">${escapeHtml(input.title)}</h1><p style="font-size:15px;line-height:1.7">${escapeHtml(input.message)}</p><p style="margin:26px 0"><a style="display:inline-block;padding:14px 22px;background:#6632cf;color:white;border:1px solid #252525;border-radius:8px;text-decoration:none;font-weight:bold" href="${escapeHtml(url.href)}">Buka SummaPass</a></p><p style="font-size:12px;color:#625c56;line-height:1.7">Masuk dengan akun pemesan untuk melihat tiket.</p></div></div></div>`;
 return emailPayload.parse({from:input.from,to:[input.to],subject:input.title.replace(/[\r\n]/g,' ').slice(0,200),text:`${input.title}\n\n${input.message}\n\nBuka SummaPass: ${url.href}\nMasuk dengan akun pemesan untuk melihat tiket.`,html});
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
