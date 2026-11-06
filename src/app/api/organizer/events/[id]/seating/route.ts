import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { seatingConfiguration,replaceLayout } from '@/features/seating/service';
import { seatingBody,seatingFailure } from '@/features/seating/http';
type Context={params:Promise<{id:string}>};
export async function GET(_:NextRequest,{params}:Context){try{return NextResponse.json(await seatingConfiguration(z.string().uuid().parse((await params).id)),{headers:{'Cache-Control':'no-store'}});}catch(e){return seatingFailure(e);}}
export async function PUT(r:NextRequest,{params}:Context){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await replaceLayout(z.string().uuid().parse((await params).id),await seatingBody(r)));}catch(e){return seatingFailure(e);}}
