import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { ticket } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){const user=await getSession();if(!user)return NextResponse.json({error:'Silakan masuk kembali.'},{status:401});try{return NextResponse.json(await ticket(user.id,z.string().uuid().parse((await params).id)),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
