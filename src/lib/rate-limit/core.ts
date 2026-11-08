import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export const ratePolicies = {
  loginNetwork: { limit: 30, windowSeconds: 600 },
  loginAccount: { limit: 10, windowSeconds: 600 },
  reservation: { limit: 12, windowSeconds: 60 },
  payment: { limit: 20, windowSeconds: 60 },
  ticketEmail: { limit: 5, windowSeconds: 600 },
  checkIn: { limit: 120, windowSeconds: 60 },
} as const;
export type RatePolicy = keyof typeof ratePolicies;
export type RateDecision = { allowed: boolean; remaining: number; retryAfter: number };

// Do not trust client-supplied forwarding headers unless the deployment's proxy
// overwrites the configured header. Without one, login uses a shared bucket.
export function networkIdentity(headers: Headers, trustedHeader?: string): string {
  if (!trustedHeader) return 'shared-network';
  if (!['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip'].includes(trustedHeader)) throw Error('Invalid trusted IP header');
  const raw = headers.get(trustedHeader)?.split(',')[0].trim() ?? '';
  if (!isIP(raw)) return 'shared-network';
  return isIP(raw) === 6 ? new URL(`http://[${raw}]/`).hostname : raw;
}

export function rateKey(policy: RatePolicy, identity: string, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify([policy, identity])).digest('hex');
}

export class MemoryRateLimiter {
  private buckets = new Map<string, { hits: number; resetAt: number }>();
  constructor(private capacity = 10_000) {}
  consume(key: string, policy: RatePolicy, now = Date.now()): RateDecision {
    const { limit, windowSeconds } = ratePolicies[policy];
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.capacity) {
        for (const [id, entry] of this.buckets) if (entry.resetAt <= now) this.buckets.delete(id);
        // Never evict active counters, which would let callers reset a limit.
        if (this.buckets.size >= this.capacity) throw Error('Rate limiter capacity reached');
      }
      bucket = { hits: 0, resetAt: now + windowSeconds * 1000 };
      this.buckets.set(key, bucket);
    }
    const allowed = bucket.hits < limit;
    bucket.hits = Math.min(limit + 1, bucket.hits + 1);
    return { allowed, remaining: Math.max(0, limit - bucket.hits), retryAfter: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
}

export function rateLimitResponse(decision: RateDecision, html = false): Response {
  const wait = Math.max(1, Math.ceil(decision.retryAfter));
  const error = `Terlalu banyak permintaan. Coba lagi dalam ${wait} detik.`;
  const headers = { 'Retry-After': String(wait), 'Cache-Control': 'private, no-store' };
  if (html) return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tunggu sebentar | SummaPass</title><body style="font-family:system-ui;background:#f0f1f3;color:#24221f;margin:0;padding:48px 24px"><main style="max-width:480px;margin:10vh auto;padding:32px;background:#ffe044;border:2px solid #24221f;border-radius:20px"><h1>Tunggu sebentar</h1><p>${error}</p><a href="/login" style="color:#6632cf">Kembali ke halaman masuk</a></main></body></html>`, { status: 429, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  return Response.json({ code: 'RATE_LIMIT', error, retryAfter: wait }, { status: 429, headers });
}
