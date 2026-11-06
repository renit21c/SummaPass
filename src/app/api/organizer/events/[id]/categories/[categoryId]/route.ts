import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { saveCategory } from '@/features/seating/service';
import { seatingBody,seatingFailure } from '@/features/seating/http';
export async function PATCH(r:NextRequest,{params}:{params:Promise<{id:string;categoryId:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{const p=await params;return NextResponse.json(await saveCategory(z.string().uuid().parse(p.id),z.string().uuid().parse(p.categoryId),await seatingBody(r)));}catch(e){return seatingFailure(e);}}
