import 'server-only';
import { organizer } from '@/features/catalog/service';
import { catalogResult } from '@/features/catalog/contract';
import { BookingError } from '@/features/booking/types';
import { supabaseServer } from '@/lib/supabase/server';
import { categoryInput, layoutInput, seatingConfigSchema } from './core';

async function call(name:string,args:Record<string,unknown>){
 const user=await organizer();
 if(user.mode==='demo')throw new BookingError('SUPABASE_REQUIRED','Pengaturan denah fleksibel memerlukan mode Supabase.',409);
 const {data,error}=await (await supabaseServer()).rpc(name,args);
 const result=seatingConfigSchema.safeParse(catalogResult(data,error));
 if(!result.success)throw new BookingError('DATABASE','Konfigurasi denah belum dapat dimuat.',503);
 return result.data;
}
export async function seatingConfiguration(id:string){return call('seating_configuration',{p_event:id});}
export async function replaceLayout(id:string,raw:unknown){const input=layoutInput.parse(raw);return call('configure_event_layout',{p_event:id,p_version:input.expectedVersion,p_layout:input});}
export async function saveCategory(id:string,categoryId:string|null,raw:unknown){const input=categoryInput.parse(raw);return call('configure_ticket_category',{p_event:id,p_category:categoryId,p_version:input.expectedVersion,p_data:input});}
