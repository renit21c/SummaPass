import 'server-only';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authMode } from '@/lib/auth/config';
import { MemoryRateLimiter, networkIdentity, rateKey, rateLimitResponse, ratePolicies, type RateDecision, type RatePolicy } from './core';

const memory = new MemoryRateLimiter();
const demoSecret = randomBytes(32).toString('hex');

// Return a response before parsing a body or performing the protected operation.
// Authenticated identities must come from getSession(), never request input.
export async function requestLimit(request: Request, policy: RatePolicy, userId?: string): Promise<Response | null> {
  try {
    const mode = authMode();
    const secret = mode === 'demo' ? demoSecret : process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw Error('Missing rate limit configuration');
    const identity = policy === 'loginNetwork'
      ? networkIdentity(request.headers, process.env.SUMMAPASS_TRUSTED_IP_HEADER)
      : userId;
    if (!identity) throw Error('Missing trusted identity');
    const key = rateKey(policy, identity, secret);
    let decision: RateDecision;
    if (mode === 'demo') decision = memory.consume(key, policy);
    else {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) throw Error('Missing database configuration');
      const client = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.rpc('consume_request_limit', {
        p_key: key, p_limit: ratePolicies[policy].limit, p_window: ratePolicies[policy].windowSeconds,
      });
      if (error || !data || typeof data.allowed !== 'boolean' || !Number.isInteger(data.remaining) || !Number.isInteger(data.retryAfter)) throw Error('Rate limit unavailable');
      decision = data as RateDecision;
    }
    if (decision.allowed) return null;
    return rateLimitResponse(decision, policy.startsWith('login') && !!request.headers.get('accept')?.includes('text/html'));
  } catch {
    // Do not silently switch to per-process counters when Supabase is unavailable.
    return Response.json({ code: 'RATE_LIMIT_UNAVAILABLE', error: 'Permintaan belum dapat diproses. Coba lagi sebentar.' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '30' },
    });
  }
}
