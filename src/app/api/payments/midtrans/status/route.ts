import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { booking, payByReference } from '@/features/booking/service';
import { getMidtransConfig } from '@/lib/payments/midtrans-core';
import { authMode } from '@/lib/auth/config';
import { runNotifications } from '@/features/notifications/worker';

export const maxDuration = 30;

const requestSchema = z.object({
  bookingId: z.string().uuid('ID reservasi tidak valid.'),
  orderId: z.string().optional()
});

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Permintaan tidak diizinkan.' }, { status: 403 });
  }

  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Silakan masuk kembali.' }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Format permintaan tidak valid.' }, { status: 400 });
    }

    const { bookingId, orderId } = requestSchema.parse(body);
    const currentBooking = await booking(user.id, bookingId);

    // If already confirmed locally
    if (currentBooking.status === 'CONFIRMED') {
      return NextResponse.json({ success: true, status: 'PAID', paid: true });
    }

    if (!orderId) {
      return NextResponse.json({ success: true, status: currentBooking.status, paid: false });
    }

    const config = getMidtransConfig();
    if (!config.serverKey) {
      return NextResponse.json({ error: 'MIDTRANS_SERVER_KEY belum dikonfigurasi.' }, { status: 500 });
    }

    const baseUrl = config.isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2';
    const authHeader = 'Basic ' + Buffer.from(config.serverKey + ':').toString('base64');

    const res = await fetch(`${baseUrl}/${encodeURIComponent(orderId)}/status`, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      // Transaction might not be initiated or created yet
      return NextResponse.json({
        success: true,
        status: currentBooking.status,
        paid: false
      });
    }

    const data = await res.json();
    const transactionStatus = data.transaction_status;
    const fraudStatus = data.fraud_status;

    if (
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept')
    ) {
      // Reconcile and confirm booking immediately
      await payByReference(currentBooking.reference, 'success');
      if (authMode() === 'supabase') {
        try {
          await runNotifications();
        } catch (err) {
          console.error('Midtrans status notification worker error:', err);
        }
      }
      return NextResponse.json({
        success: true,
        status: 'PAID',
        paid: true,
        transactionStatus
      });
    }

    if (
      transactionStatus === 'expire' ||
      transactionStatus === 'cancel' ||
      transactionStatus === 'deny'
    ) {
      await payByReference(currentBooking.reference, 'failure');
      return NextResponse.json({
        success: true,
        status: 'CANCELLED',
        paid: false,
        transactionStatus
      });
    }

    return NextResponse.json({
      success: true,
      status: currentBooking.status,
      paid: false,
      transactionStatus: transactionStatus || 'pending'
    });
  } catch (error) {
    console.error('Midtrans status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memeriksa status pembayaran.' },
      { status: 500 }
    );
  }
}

