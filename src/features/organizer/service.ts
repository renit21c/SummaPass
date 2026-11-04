import 'server-only';
import { getSession,canAccessRole } from '@/lib/auth/session';
import { demoOrganizerSnapshot } from '@/features/booking/service';
import { supabaseServer } from '@/lib/supabase/server';
import { BookingError } from '@/features/booking/types';
import { decodeCatalog } from '@/features/catalog/contract';
import type { OrganizerSnapshot } from './core';
export async function organizerSnapshot():Promise<OrganizerSnapshot>{const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);if(user.mode==='demo')return demoOrganizerSnapshot(user.id);const {data,error}=await (await supabaseServer()).rpc('organizer_snapshot');if(error)throw new BookingError('DATABASE','Dashboard belum dapat dimuat. Periksa konfigurasi database.',503);if(data?.error)throw new BookingError('FORBIDDEN','Tidak ada event yang ditugaskan.',403);const snapshot=data as OrganizerSnapshot;snapshot.events=decodeCatalog(snapshot.events);const {data:entries,error:attendanceError}=await (await supabaseServer()).from('check_ins').select('event_id').in('event_id',snapshot.events.map(e=>e.id));if(!attendanceError)snapshot.attendance=snapshot.events.map(e=>({slug:e.slug,checkedIn:(entries??[]).filter(i=>i.event_id===e.id).length}));return snapshot;}
