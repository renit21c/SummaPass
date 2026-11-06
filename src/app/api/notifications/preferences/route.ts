import { NextRequest,NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { notificationFailure as failure } from '@/features/notifications/http';
import { notificationPreferences } from '@/features/notifications/core';
import { preferences } from '@/features/notifications/service';
import { notificationBody } from '@/features/notifications/http';
export async function GET(){try{return NextResponse.json(await preferences(),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function PUT(r:NextRequest){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{return NextResponse.json(await preferences(notificationPreferences.parse(await notificationBody(r,4096))));}catch(e){return failure(e);}}
