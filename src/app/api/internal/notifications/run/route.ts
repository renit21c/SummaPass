import { NextRequest,NextResponse } from 'next/server';
import { validCronAuthorization } from '@/features/notifications/cron-auth';
import { runNotifications } from '@/features/notifications/worker';
import { notificationFailure as failure } from '@/features/notifications/http';
export const maxDuration=60;
async function run(r:NextRequest){const secret=process.env.SUMMAPASS_CRON_SECRET??process.env.CRON_SECRET;if(!validCronAuthorization(r.headers.get('authorization'),secret))return NextResponse.json({error:'Akses ditolak.'},{status:401});try{return NextResponse.json(await runNotifications(),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function GET(r:NextRequest){return run(r);}
export async function POST(r:NextRequest){return run(r);}
