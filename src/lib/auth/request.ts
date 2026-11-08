import type { NextRequest } from 'next/server';
export function sameOrigin(request: NextRequest) {
 const origin = request.headers.get('origin');
 if (!origin) return false;
 try {const parsed = new URL(origin);return ['http:','https:'].includes(parsed.protocol) && parsed.host === request.headers.get('host');} catch {return false;}
}
export function requestOrigin(request: NextRequest) {
 // Call only after sameOrigin succeeds. Keeps localhost and 127.0.0.1 cookies
 // on the exact host the browser used, even when Next normalizes request.url.
 return request.headers.get('origin')!;
}

export function emailRedirectOrigin(request: NextRequest, configured = process.env.SUMMAPASS_APP_URL) {
 if (configured) {
  try {
   const url = new URL(configured);
   if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch { /* Fall back to the verified request origin. */ }
 }
 return requestOrigin(request);
}
