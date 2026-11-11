import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { promoFailure as failure } from '@/features/promos/http';
import { getPromosByEvent,createPromo,updatePromo,deletePromo } from '@/features/promos/service';
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(_r:NextRequest,{params}:Context){
 try{return NextResponse.json({promos:await getPromosByEvent((await params).id)},{headers});}catch(e){return failure(e);}
}
export async function POST(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{return NextResponse.json({promo:await createPromo((await params).id,await r.json())},{status:201,headers});}catch(e){return failure(e);}
}
export async function PATCH(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{const {id,...patch}=z.object({id:z.string().min(1).max(100)}).passthrough().parse(await r.json());return NextResponse.json({promo:await updatePromo((await params).id,id,patch)},{headers});}catch(e){return failure(e);}
}
export async function DELETE(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{const id=z.string().min(1).max(100).parse(r.nextUrl.searchParams.get('promoId'));return NextResponse.json({success:await deletePromo((await params).id,id)},{headers});}catch(e){return failure(e);}
}
