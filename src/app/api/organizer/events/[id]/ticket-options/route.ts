import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { ticketOptions,saveTicketOption } from '@/features/ticket-options/service';
import { seatingBody,seatingFailure } from '@/features/seating/http';
export async function GET(_r:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{return NextResponse.json(await ticketOptions(z.string().uuid().parse((await params).id)),{headers:{'Cache-Control':'no-store'}});}catch(e){return seatingFailure(e);}
}
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{return NextResponse.json(await saveTicketOption(z.string().uuid().parse((await params).id),await seatingBody(r)),{headers:{'Cache-Control':'no-store'}});}catch(e){return seatingFailure(e);}
}
