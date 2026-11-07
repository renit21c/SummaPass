import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { notificationFailure as failure } from '@/features/notifications/http';
import { deliveryHistory } from '@/features/notifications/service';
export async function GET(_:NextRequest,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await deliveryHistory(z.string().uuid().parse((await params).id)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
