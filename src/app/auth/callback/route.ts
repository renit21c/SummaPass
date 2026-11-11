import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/auth/config';
import { getSession,loginDestination } from '@/lib/auth/session';
import { exchangeAuthCallback } from '@/lib/auth/google';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeReturnPath(searchParams.get('next'));
  let destination:string|null=null;
  try {
    destination=await exchangeAuthCallback(searchParams,await supabaseServer(),async returnTo=>{
      const user=await getSession();
      return user?loginDestination(user,returnTo):null;
    });
  } catch {
    // Never echo provider errors, authorization codes or tokens to the browser.
  }
  const failure=new URL('/login',origin);
  failure.searchParams.set('error',searchParams.get('flow')==='google'?(searchParams.get('error')==='access_denied'?'google_cancelled':'google_failed'):'verification_failed');
  failure.searchParams.set('next',next);
  const response=NextResponse.redirect(destination?new URL(destination,origin):failure);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
}

