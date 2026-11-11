import { NextRequest,NextResponse } from 'next/server';
import { getSession,endSession,deleteDemoAccountSessions } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/auth/request';
import { requestLimit } from '@/lib/rate-limit/server';
import { deleteAccountSchema } from '@/features/account/deletion-core';
import { deleteSupabaseAccount,verifyDeletionPassword } from '@/features/account/deletion';
import { failure } from '@/features/booking/http';
import { ZodError } from 'zod';
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});
 const limited=await requestLimit(request,'accountDeletion',user.id);if(limited)return limited;
 try{
  const input=deleteAccountSchema.parse(await request.json().catch(()=>null));
  if(user.mode==='supabase'){await verifyDeletionPassword(user,input.password);await deleteSupabaseAccount(user.id);}
  else deleteDemoAccountSessions(user.id);
  await endSession();return NextResponse.json({success:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof ZodError)return NextResponse.json({error:e.issues[0]?.message??'Periksa konfirmasi penghapusan.'},{status:400});return failure(e);}
}
