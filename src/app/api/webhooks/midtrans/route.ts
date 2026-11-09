import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyMidtransSignature } from '@/lib/payments/midtrans';
import { payByReference } from '@/features/booking/service';
import { authMode } from '@/lib/auth/config';
import { runNotifications } from '@/features/notifications/worker';

export const maxDuration = 60;

const webhookSchema = z.object({
  order_id: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  signature_key: z.string(),
  transaction_status: z.string(),
  fraud_status: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
    }

    const payload = webhookSchema.safeParse(body);
    if (!payload.success) {
      return NextResponse.json({ error: 'Format webhook tidak lengkap.' }, { status: 400 });
    }

    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = payload.data;

    const isValid = verifyMidtransSignature(order_id, status_code, gross_amount, signature_key);
    if (!isValid) {
      console.warn('Midtrans webhook: invalid signature for order', order_id);
      return NextResponse.json({ error: 'Tanda tangan keamanan tidak valid.' }, { status: 401 });
    }

    // Extract reference (e.g. SP-956CFB1D from SP-956CFB1D-123456)
    const baseReference = order_id.split('-').slice(0, 2).join('-');

    if (
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept')
    ) {
      const confirmed = await payByReference(baseReference, 'success');
      if (confirmed && authMode() === 'supabase') {
        try {
          await runNotifications();
        } catch (err) {
          console.error('Midtrans webhook worker error:', err);
        }
      }
      return NextResponse.json({ status: 'OK', message: 'Pembayaran berhasil dikonfirmasi.' });
    }

    if (
      transaction_status === 'expire' ||
      transaction_status === 'cancel' ||
      transaction_status === 'deny'
    ) {
      await payByReference(baseReference, 'failure');
      return NextResponse.json({ status: 'OK', message: 'Reservasi dibatalkan atau kedaluwarsa.' });
    }

    // Pending or challenge state
    return NextResponse.json({ status: 'OK', message: 'Status transaksi dicatat.' });
  } catch (error) {
    console.error('Midtrans webhook processing failed:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
