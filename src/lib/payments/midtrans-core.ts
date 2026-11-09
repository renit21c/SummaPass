import crypto from 'node:crypto';

export function getMidtransConfig() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';

  return {
    serverKey,
    clientKey,
    isProduction,
    snapUrl: isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
    snapJsUrl: isProduction
      ? 'https://app.midtrans.com/snap/snap.js'
      : 'https://app.sandbox.midtrans.com/snap/snap.js'
  };
}

export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  signatureKey: string,
  serverKeyOverride?: string
): boolean {
  const serverKey = serverKeyOverride || process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return false;

  const raw = `${orderId}${statusCode}${grossAmount}${serverKey}`;
  const calculated = crypto.createHash('sha512').update(raw).digest('hex');
  return calculated.toLowerCase() === signatureKey.toLowerCase();
}
