import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BookingError } from './types';
export function failure(error:unknown){if(error instanceof ZodError)return NextResponse.json({error:'Periksa pilihan kursi dan nama peserta.'},{status:400});if(error instanceof BookingError||(error instanceof Error&&error.name==='BookingError'&&'status' in error&&typeof error.status==='number'&&'code' in error))return NextResponse.json({error:error.message,code:error.code},{status:(error as BookingError).status});return NextResponse.json({error:'Ada kendala sementara. Silakan coba lagi.'},{status:503});}
