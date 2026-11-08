import { NextRequest,NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { checkInInput } from '@/features/check-in/core';
import { checkIn } from '@/features/check-in/service';
import { getSession, canAccessRole } from '@/lib/auth/session';
import { requestLimit } from '@/lib/rate-limit/server';
export async function POST(r:NextRequest){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{
  const user=await getSession();
  if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});
  if(!await canAccessRole(user,'STAFF'))return NextResponse.json({error:'Akses petugas diperlukan.'},{status:403});
  const limited=await requestLimit(r,'checkIn',user.id);if(limited)return limited;
  const input=checkInInput.safeParse(await r.json());
  if(!input.success)return NextResponse.json({error:'Pilih event dan masukkan QR atau nomor tiket yang valid.'},{status:400});
  const {slug,credential,confirm}=input.data;
  return NextResponse.json(await checkIn(slug,credential,confirm),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(e){return failure(e);}
}
