import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { inventory } from '@/features/booking/service';
import { promoFailure as failure } from '@/features/promos/http';
import { BookingError } from '@/features/booking/types';
import { publicPromos } from '@/features/promos/service';
import { calculateApplicablePromo } from '@/features/promos/core';
import { sameOrigin } from '@/lib/auth/request';
const headers={'Cache-Control':'no-store'};
const quoteSchema=z.object({categoryId:z.string().min(1),quantity:z.number().int().min(1).max(30),packageId:z.string().uuid().optional(),packageQuantity:z.number().int().min(1).max(6).optional(),voucherCode:z.string().trim().max(30).optional()});
type Context={params:Promise<{slug:string}>};
export async function GET(_r:NextRequest,{params}:Context){
 try{return NextResponse.json({promos:await publicPromos((await params).slug)},{headers});}catch(e){return failure(e);}
}
export async function POST(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{
  const {slug}=await params,body=quoteSchema.parse(await r.json()),inv=await inventory(slug);
  const category=inv.categories.find(c=>c.id===body.categoryId),pack=category?.packages?.find(p=>p.id===body.packageId);
  if(!category||(body.packageId&&!pack)||(!body.packageId&&category.packages?.length))throw new BookingError('INPUT','Pilih kategori dan paket tiket.',400);
  if(pack&&body.quantity!==pack.participants*(body.packageQuantity??1))throw new BookingError('INPUT','Jumlah peserta harus sesuai paket.',400);
  const subtotal=pack?pack.price*(body.packageQuantity??1):category.price*body.quantity;
  const promos=await publicPromos(slug,body.voucherCode);
  const calculation=calculateApplicablePromo(promos,{categoryId:category.id,quantity:body.quantity,subtotal},body.voucherCode);
  return NextResponse.json({...calculation,promos},{headers});
 }catch(e){return failure(e);}
}
