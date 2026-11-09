import 'server-only';
import type { Booking } from '@/features/booking/types';
import { getMidtransConfig, verifyMidtransSignature } from './midtrans-core';

export { getMidtransConfig, verifyMidtransSignature };

export async function createMidtransSnapTransaction(
  booking: Booking,
  customer: { name?: string; email?: string }
): Promise<{ token: string; redirectUrl: string }> {
  const config = getMidtransConfig();
  if (!config.serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi di environment variables.');
  }

  const authHeader = 'Basic ' + Buffer.from(config.serverKey + ':').toString('base64');

  // Format order_id: SP-XXXXXXXX-TIMESTAMP to guarantee uniqueness on retry
  const orderId = `${booking.reference}-${Date.now().toString().slice(-6)}`;

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: booking.total
    },
    item_details: booking.items.map(i => ({
      id: i.seatId.slice(0, 50),
      price: i.price,
      quantity: 1,
      name: `${booking.eventTitle || 'Tiket'} - ${i.label}`.slice(0, 50)
    })),
    customer_details: {
      first_name: customer.name || 'Pengunjung',
      email: customer.email || 'pengunjung@summapass.id'
    },
    enabled_payments: [
      'gopay',
      'shopeepay',
      'qris',
      'bca_va',
      'bni_va',
      'bri_va',
      'mandiri_va',
      'permata_va',
      'other_va'
    ]
  };

  const res = await fetch(config.snapUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok || !data.token) {
    const msg = data.error_messages ? data.error_messages.join(', ') : 'Gagal membuat sesi pembayaran Midtrans.';
    throw new Error(msg);
  }

  return {
    token: data.token,
    redirectUrl: data.redirect_url
  };
}
