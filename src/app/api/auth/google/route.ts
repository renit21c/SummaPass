import { NextRequest,NextResponse } from 'next/server';
import { authMode,safeReturnPath } from '@/lib/auth/config';
import { googleOAuthOptions } from '@/lib/auth/google';
import { requestOrigin,sameOrigin } from '@/lib/auth/request';
import { requestLimit } from '@/lib/rate-limit/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 const origin=requestOrigin(request);
 let next='/account';
 const failed=()=>{
  const url=new URL('/login',origin);url.searchParams.set('error','google_unavailable');url.searchParams.set('next',next);
  return NextResponse.redirect(url,303);
 };
 try{
  next=safeReturnPath((await request.formData()).get('next'));
  if(authMode()!=='supabase')return failed();
  const limited=await requestLimit(request,'loginNetwork');if(limited)return limited;
  // Avoid navigating to a raw provider error while Google is not configured.
  const settings=await fetch(new URL('/auth/v1/settings',process.env.NEXT_PUBLIC_SUPABASE_URL!),{
   headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},cache:'no-store',signal:AbortSignal.timeout(8000),
  });
  if(!settings.ok)return failed();
  const configuration=await settings.json() as {external?:{google?:boolean}};
  if(configuration.external?.google!==true)return failed();
  const client=await supabaseServer();
  // Route-handler cookies persist the PKCE verifier before the browser leaves.
  // Keep the callback on the initiating origin so localhost testing also works.
  const {data,error}=await client.auth.signInWithOAuth(googleOAuthOptions(origin,next));
  if(error||!data.url)return failed();
  const destination=new URL(data.url),supabase=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if(destination.origin!==supabase.origin||destination.pathname!=='/auth/v1/authorize')return failed();
  const response=NextResponse.redirect(destination,303);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
 }catch{return failed();}
}
