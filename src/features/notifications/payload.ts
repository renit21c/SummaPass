import { createCipheriv,createDecipheriv,hkdfSync,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { emailPayload,type EmailPayload } from './email';
export const encryptedEmailPayload=z.object({version:z.literal(2),ciphertext:z.string().max(3000000).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),ticketIds:z.array(z.string().uuid()).max(6)});
export const storedEmailPayload=z.union([encryptedEmailPayload,emailPayload]);
export type StoredEmailPayload=z.infer<typeof storedEmailPayload>;
const aad=(ids:string[])=>Buffer.from('SummaPass notification delivery v2:'+JSON.stringify(ids));
function deliveryKey(master:Buffer){if(master.length!==32)throw Error('DELIVERY_KEY_INVALID');return Buffer.from(hkdfSync('sha256',master,'SummaPass','notification-delivery-v2',32));}
export function sealEmail(payload:EmailPayload,ticketIds:string[],key:Buffer):StoredEmailPayload{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',deliveryKey(key),iv);cipher.setAAD(aad(ticketIds));
 const plaintext=Buffer.from(JSON.stringify(emailPayload.parse(payload)));
 if(plaintext.length>2100000)throw Error('EMAIL_PAYLOAD_TOO_LARGE');
 const data=Buffer.concat([cipher.update(plaintext),cipher.final()]);
 return encryptedEmailPayload.parse({version:2,ciphertext:[iv,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.'),ticketIds});
}
export function openEmail(stored:StoredEmailPayload,key:Buffer):EmailPayload{
 if(!('version' in stored))return emailPayload.parse(stored); // Preserve old requests exactly for idempotent retries.
 const parsed=encryptedEmailPayload.parse(stored),[iv,tag,data]=parsed.ciphertext.split('.').map(s=>Buffer.from(s,'base64url'));
 const decipher=createDecipheriv('aes-256-gcm',deliveryKey(key),iv);decipher.setAAD(aad(parsed.ticketIds));decipher.setAuthTag(tag);
 return emailPayload.parse(JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')));
}
