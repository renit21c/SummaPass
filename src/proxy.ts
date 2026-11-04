import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { authMode } from '@/lib/auth/config';
export async function proxy(request: NextRequest) {
 const referrerPolicy=request.nextUrl.pathname.startsWith('/my-tickets')||request.nextUrl.pathname.startsWith('/api/tickets')?'no-referrer':'same-origin';
 if (authMode() !== 'supabase') { const demoResponse=NextResponse.next();demoResponse.headers.set('Cache-Control','private, no-store');demoResponse.headers.set('Referrer-Policy',referrerPolicy);return demoResponse; }
 let response = NextResponse.next({request});
 const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 await client.auth.getUser();
 response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy',referrerPolicy);
 return response;
}
export const config = { matcher: ['/account/:path*','/my-tickets/:path*','/api/tickets/:path*','/bookings/:path*','/events/:path*','/api/bookings/:path*','/login','/organizer/:path*','/api/organizer/:path*','/staff/:path*','/api/staff/:path*','/api/auth/:path*'] };
