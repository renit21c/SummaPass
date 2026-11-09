import { NextRequest,NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/auth/request';
import { failure } from '@/features/booking/http';
import { staffEvents } from '@/features/check-in/service';

export async function GET(r:NextRequest){
 const origin=r.headers.get('origin');
 if(origin&&!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{return NextResponse.json(await staffEvents(),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
 catch(e){return failure(e);}
}
