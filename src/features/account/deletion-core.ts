import { z } from 'zod';
export const deleteAccountSchema=z.object({
 confirmation:z.literal('HAPUS AKUN',{error:'Ketik HAPUS AKUN untuk melanjutkan.'}),
 password:z.string().min(1,'Masukkan kata sandi akun.').max(128).optional()
}).strict();
export async function finishAuthDeletion(id:string,remove:(id:string)=>Promise<{error:unknown}>,markComplete:(id:string)=>Promise<void>){
 const result=await remove(id);if(result.error)return false;
 await markComplete(id);return true;
}
