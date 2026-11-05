import 'server-only';
import { getSession,canAccessRole } from '@/lib/auth/session';
import { demoOrganizerSnapshot,demoEventStaff,demoAssignStaff,demoUnassignStaff } from '@/features/booking/service';
import { supabaseServer } from '@/lib/supabase/server';
import { BookingError } from '@/features/booking/types';
import { decodeCatalog } from '@/features/catalog/contract';
import type { OrganizerSnapshot } from './core';
import type { StaffAssignment } from './staff-persistence';
export async function organizerSnapshot():Promise<OrganizerSnapshot>{const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);if(user.mode==='demo')return demoOrganizerSnapshot(user.id);const {data,error}=await (await supabaseServer()).rpc('organizer_snapshot');if(error)throw new BookingError('DATABASE','Dashboard belum dapat dimuat. Periksa konfigurasi database.',503);if(data?.error)throw new BookingError('FORBIDDEN','Tidak ada event yang ditugaskan.',403);const snapshot=data as OrganizerSnapshot;snapshot.events=decodeCatalog(snapshot.events);const {data:entries,error:attendanceError}=await (await supabaseServer()).from('check_ins').select('event_id').in('event_id',snapshot.events.map(e=>e.id));if(!attendanceError)snapshot.attendance=snapshot.events.map(e=>({slug:e.slug,checkedIn:(entries??[]).filter(i=>i.event_id===e.id).length}));return snapshot;}

export async function getEventStaff(eventId:string):Promise<StaffAssignment[]>{
 const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);
 if(user.mode==='demo')return demoEventStaff(user.id,eventId);
 const client=await supabaseServer();
 const {data,error}=await client.rpc('event_staff',{p_event:eventId});
 if(error)throw new BookingError('DATABASE','Fungsi event_staff belum tersedia di Supabase. Jalankan migrasi 202611050008_staff_assignment.sql di SQL Editor Supabase.',503);
 return (data??[]) as StaffAssignment[];
}

export async function assignEventStaff(eventId:string,name:string,targetUserId?:string):Promise<StaffAssignment>{
 const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);
 if(user.mode==='demo')return demoAssignStaff(user.id,eventId,name,targetUserId);
 const client=await supabaseServer();
 let uid=targetUserId;
 if(!uid||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)){
  const {data:p}=await client.from('profiles').select('id').eq('display_name',name.trim()).maybeSingle();
  if(p?.id){
   uid=p.id;
  } else {
   const newId=crypto.randomUUID();
   const {error:insErr}=await client.from('profiles').insert({id:newId,display_name:name.trim()});
   if(!insErr)uid=newId;
  }
 }
 const {data,error}=await client.rpc('assign_staff',{p_event:eventId,p_user:uid});
 if(error||data?.error)throw new BookingError('FORBIDDEN',data?.message??'Gagal menugaskan petugas. Pastikan migrasi 202611050008_staff_assignment.sql sudah dijalankan di SQL Editor Supabase.',403);
 return {eventId,userId:data.userId??uid,name:data.name??name,role:'STAFF',assignedAt:new Date().toISOString()};
}

export async function unassignEventStaff(eventId:string,targetUserId:string):Promise<void>{
 const user=await getSession();if(!user)throw new BookingError('AUTH','Silakan masuk.',401);if(!await canAccessRole(user,'ORGANIZER'))throw new BookingError('FORBIDDEN','Akses organizer diperlukan.',403);
 if(user.mode==='demo')return demoUnassignStaff(user.id,eventId,targetUserId);
 const client=await supabaseServer();
 const {data,error}=await client.rpc('unassign_staff',{p_event:eventId,p_user:targetUserId});
 if(error||data?.error)throw new BookingError('FORBIDDEN',data?.message??'Gagal mencabut penugasan.',403);
}
