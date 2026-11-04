import { NextRequest,NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/auth/request';
import { reserve } from '@/features/booking/service';
import { reserveSchema } from '@/features/booking/types';
import { failure } from '@/features/booking/http';
export async function POST(request:NextRequest){if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});try{let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'Format permintaan tidak valid.'},{status:400});}return NextResponse.json(await reserve(user.id,reserveSchema.parse(body)),{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
