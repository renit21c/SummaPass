import 'server-only';
import { getSession,canAccessRole } from '@/lib/auth/session';
import { BookingError } from '../booking/types';
import { demoCheckIn,demoStaffEvents } from '../booking/service';
import { supabaseServer } from '@/lib/supabase/server';
import { tokenHash } from '../tickets/crypto';
import type { CheckInResult } from './core';
async function staff(){const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk kembali.',401);if(!await canAccessRole(user,'STAFF'))throw new BookingError('FORBIDDEN','Akses petugas diperlukan.',403);return user;}
export async function staffEvents(){const user=await staff();if(user.mode==='demo')return demoStaffEvents();const client=await supabaseServer();const {data,error}=await client.rpc('staff_events');if(error)throw new BookingError('DATABASE','Daftar event belum tersedia. Periksa migrasi check-in.',503);return data as {slug:string;title:string}[];}
export async function checkIn(slug:string,credential:string,confirm:boolean):Promise<CheckInResult>{const user=await staff();if(user.mode==='demo')return demoCheckIn(user.id,slug,credential,confirm);const reference=/^SPT-[A-F0-9]{32}$/i.test(credential)?credential.toUpperCase():null;const {data,error}=await (await supabaseServer()).rpc('validate_check_in',{p_slug:slug,p_reference:reference,p_hash:reference?null:tokenHash(credential),p_confirm:confirm});if(error)throw new BookingError('DATABASE','Tiket belum dapat diperiksa. Coba lagi.',503);if(data?.error)throw new BookingError('FORBIDDEN','Event tidak ditugaskan kepada petugas.',403);return data as CheckInResult;}
