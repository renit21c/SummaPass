import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { editEvent,statusEvent,deleteEvent } from '@/features/catalog/service';
import { eventInput } from '@/features/catalog/core';
import { ZodError } from 'zod';
import { failure } from '@/features/booking/http';
export async function PATCH(r:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await editEvent((await params).id,eventInput.parse(await r.json())));}catch(e){if(e instanceof ZodError)return NextResponse.json({error:e.issues.map(i=>i.message).join(' ')},{status:400});return failure(e);}}
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{const {action}=z.object({action:z.enum(['publish','unpublish','archive'])}).parse(await r.json());return NextResponse.json(await statusEvent((await params).id,action));}catch(e){if(e instanceof ZodError)return NextResponse.json({error:e.issues.map(i=>i.message).join(' ')},{status:400});return failure(e);}}
export async function DELETE(r:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await deleteEvent((await params).id));}catch(e){return failure(e);}}
