import { requestLimit } from '@/lib/rate-limit/server';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/auth/request';
import { requestTicketEmail } from '@/features/notifications/service';
import { notificationFailure as failure } from '@/features/notifications/http';
import { notificationBody } from '@/features/notifications/http';
const bodySchema=z.object({email:z.string().email().optional(),key:z.string().uuid()});
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{const session=await getSession();if(!session)return NextResponse.json({error:'Silakan masuk.'},{status:401});const limited=await requestLimit(r,'ticketEmail',session.id);if(limited)return limited;const input=bodySchema.parse(await notificationBody(r,4096));if(input.email&&input.email.toLowerCase()!==session.email.toLowerCase())return NextResponse.json({error:'Tautan tiket hanya dikirim ke email akun pemesan.'},{status:400});return NextResponse.json(await requestTicketEmail(z.string().uuid().parse((await params).id),input.key),{status:202,headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}
}
