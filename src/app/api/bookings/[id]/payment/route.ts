import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { getSession } from '@/lib/auth/session';
import { pay } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
const schema=z.object({outcome:z.enum(['success','failure'])});
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});try{const id=z.string().uuid().parse((await params).id);let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'Format permintaan tidak valid.'},{status:400});}const input=schema.parse(body);return NextResponse.json({booking:await pay(user.id,id,input.outcome)},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
