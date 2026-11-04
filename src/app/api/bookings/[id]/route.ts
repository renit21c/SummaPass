import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/auth/request';
import { booking,cancel } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});try{const id=z.string().uuid().parse((await params).id);return NextResponse.json({booking:await booking(user.id,id),serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(request))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});try{return NextResponse.json(await cancel(user.id,z.string().uuid().parse((await params).id)));}catch(error){return failure(error);}}
