import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// Svix signs the exact request bytes, including ID and timestamp. Never reserialize JSON first.
export function verifyResendWebhook(body: string, headers: Headers, secret: string | undefined, now = Date.now()) {
  if (!secret?.startsWith('whsec_')) return false;
  const id = headers.get('svix-id'), timestamp = headers.get('svix-timestamp'), signatures = headers.get('svix-signature');
  if (!id || id.length > 200 || !timestamp || !/^\d{1,12}$/.test(timestamp) || !signatures || signatures.length > 4096) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const encoded = secret.slice(6);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 16) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(' ').some(signature => {
    const [version, value] = signature.split(',');
    if (version !== 'v1' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    const actual = Buffer.from(value, 'base64');
    return actual.length === expected.length && timingSafeEqual(expected, actual);
  });
}

export const receiptTypes = ['email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed'] as const;
export const resendReceipt = z.object({
  type: z.enum(receiptTypes),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({ email_id: z.string().min(1).max(100) })
});

export async function readWebhookBody(request: Request, limit = 65536) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Error('BODY_LIMIT');
  const reader = request.body?.getReader();
  if (!reader) throw Error('BODY_REQUIRED');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    length += next.value.length;
    if (length > limit) { await reader.cancel(); throw Error('BODY_LIMIT'); }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
