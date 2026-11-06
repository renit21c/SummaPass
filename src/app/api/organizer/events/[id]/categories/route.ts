import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { saveCategory } from '@/features/seating/service';
import { seatingBody,seatingFailure } from '@/features/seating/http';
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await saveCategory(z.string().uuid().parse((await params).id),null,await seatingBody(r)));}catch(e){return seatingFailure(e);}}
