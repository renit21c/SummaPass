import { requestLimit } from '@/lib/rate-limit/server';
import { after,NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { pay } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
import { authMode } from '@/lib/auth/config';
import { runNotifications } from '@/features/notifications/worker';
export const maxDuration=60;
const schema=z.object({outcome:z.enum(['success','failure'])});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});const limited=await requestLimit(request,'payment',user.id);if(limited)return limited;try{const id=z.string().uuid().parse((await params).id);let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'Format permintaan tidak valid.'},{status:400});}const input=schema.parse(body);const result=await pay(user.id,id,input.outcome);if(input.outcome==='success'&&result.status==='CONFIRMED'&&authMode()==='supabase')after(async()=>{try{console.info('payment-notifications',await runNotifications());}catch{console.error('payment-notifications: worker failed; queued jobs will be retried by schedule');}});return NextResponse.json({booking:result},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
