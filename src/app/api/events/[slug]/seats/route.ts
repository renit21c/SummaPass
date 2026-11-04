import { NextRequest,NextResponse } from 'next/server';
import { inventory } from '@/features/booking/service';
import { failure } from '@/features/booking/http';
export async function GET(_request:NextRequest,{params}:{params:Promise<{slug:string}>}){try{return NextResponse.json(await inventory((await params).slug),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
