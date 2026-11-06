import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { notificationFailure as failure } from '@/features/notifications/http';
import { listNotifications,updateNotifications } from '@/features/notifications/service';
import { notificationUpdate } from '@/features/notifications/core';
import { notificationBody } from '@/features/notifications/http';
export async function GET(r:NextRequest){try{const cursor=z.string().uuid().nullable().parse(r.nextUrl.searchParams.get('cursor'));const limit=z.coerce.number().int().min(1).max(100).parse(r.nextUrl.searchParams.get('limit')??50);return NextResponse.json(await listNotifications(cursor,limit),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function PATCH(r:NextRequest){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{const input=notificationUpdate.parse(await notificationBody(r,4096));return NextResponse.json(await updateNotifications(input.action,input.id));}catch(e){return failure(e);}}
