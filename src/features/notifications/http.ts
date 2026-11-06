import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { failure } from '@/features/booking/http';
import { BookingError } from '@/features/booking/types';
export async function notificationBody(request:Request,limit=4096){
 if(!request.body)throw new BookingError('INPUT','Isi permintaan diperlukan.',400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new BookingError('INPUT','Permintaan terlalu besar.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new BookingError('INPUT','Format JSON tidak valid.',400);}
}
export function notificationFailure(error:unknown){if(error instanceof ZodError)return NextResponse.json({code:'INPUT',error:'Periksa isi permintaan notifikasi.'},{status:400});return failure(error);}
