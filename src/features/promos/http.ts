import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { failure } from '../booking/http';
export function promoFailure(error:unknown){
 if(error instanceof ZodError)return NextResponse.json({error:error.issues.map(i=>i.message).join(' ')},{status:400});
 if(error instanceof SyntaxError)return NextResponse.json({error:'Format permintaan tidak valid.'},{status:400});
 return failure(error);
}
