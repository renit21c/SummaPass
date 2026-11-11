import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { BookingError } from '../booking/types';
import { finishAuthDeletion } from './deletion-core';
function admin(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new BookingError('CONFIG','Penghapusan akun belum tersedia.',503);
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function verifyDeletionPassword(user:{id:string;email:string},password:string|undefined){
 if(!password)throw new BookingError('PASSWORD','Masukkan kata sandi akun.',400);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new BookingError('CONFIG','Penghapusan akun belum tersedia.',503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.signInWithPassword({email:user.email,password});
 if(error||data.user?.id!==user.id)throw new BookingError('PASSWORD','Kata sandi tidak sesuai.',403);
 // Clear the isolated verification session; retain the caller's cookies until deletion.
 await client.auth.signOut({scope:'local'});
}
export async function deleteSupabaseAccount(id:string){
 const client=admin();
 const {data,error}=await client.rpc('request_account_deletion',{p_user:id});
 if(error)throw new BookingError('DATABASE','Penghapusan akun belum dapat diproses. Periksa migrasi 023.',503);
 if(data?.error)throw new BookingError(data.error,data.message??'Penghapusan akun ditolak.');
 if(data?.ok!==true)throw new BookingError('DATABASE','Penghapusan akun belum dapat diproses.',503);
 // Soft-delete Auth retains only the identity reference needed by transaction FKs.
 try{await finishAuthDeletion(id,userId=>client.auth.admin.deleteUser(userId,true),async userId=>{
  const result=await client.from('account_deletions').update({auth_deleted_at:new Date().toISOString()}).eq('user_id',userId);
  if(result.error)throw Error('AUTH_CLEANUP_PENDING');
 });}catch{ /* The durable cleanup queue is retried by the notification worker. */ }
}
export async function retryAccountDeletions(){
 const client=admin(),{data,error}=await client.from('account_deletions').select('user_id').is('auth_deleted_at',null).limit(20);
 if(error)return; // Deployments before migration 023 retain their existing worker behavior.
 for(const row of data??[])try{await finishAuthDeletion(row.user_id,id=>client.auth.admin.deleteUser(id,true),async id=>{
  const result=await client.from('account_deletions').update({auth_deleted_at:new Date().toISOString()}).eq('user_id',id);if(result.error)throw Error('AUTH_CLEANUP_PENDING');
 });}catch{}
}
