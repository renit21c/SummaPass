import { NextRequest,NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { createEvent } from '@/features/catalog/service';
import { eventInput } from '@/features/catalog/core';
import { ZodError } from 'zod';
import { failure } from '@/features/booking/http';
export async function POST(r:NextRequest){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await createEvent(eventInput.parse(await r.json())),{status:201});}catch(e){if(e instanceof ZodError)return NextResponse.json({error:e.issues.map(i=>i.message).join(' ')},{status:400});return failure(e);}}
