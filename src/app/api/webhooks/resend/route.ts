import { NextResponse } from 'next/server';
import { notificationAdmin } from '@/features/notifications/admin';
import { readWebhookBody, resendReceipt, verifyResendWebhook } from '@/features/notifications/webhook';

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook belum dikonfigurasi.' }, { status: 503 });
  let body: string;
  try { body = await readWebhookBody(request); }
  catch { return NextResponse.json({ error: 'Payload tidak valid.' }, { status: 413 }); }
  if (!verifyResendWebhook(body, request.headers, secret)) return NextResponse.json({ error: 'Signature tidak valid.' }, { status: 401 });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: 'Payload tidak valid.' }, { status: 400 }); }
  // A verified event outside the subscriptions we use requires no processing.
  if (typeof parsed !== 'object' || !parsed || !('type' in parsed)) return NextResponse.json({ error: 'Payload tidak valid.' }, { status: 400 });
  const supported = resendReceipt.shape.type.safeParse(parsed.type);
  if (!supported.success) return NextResponse.json({ ignored: true });
  const receipt = resendReceipt.safeParse(parsed);
  if (!receipt.success) return NextResponse.json({ error: 'Payload tidak valid.' }, { status: 400 });
  try {
    const { data, error } = await notificationAdmin().rpc('record_notification_receipt', {
      p_webhook: request.headers.get('svix-id'), p_provider: receipt.data.data.email_id,
      p_type: receipt.data.type, p_at: receipt.data.created_at
    });
    if (error || data?.error) throw Error('DATABASE');
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Webhook belum dapat disimpan.' }, { status: 503 }); }
}
