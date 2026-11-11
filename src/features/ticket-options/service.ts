import 'server-only';
import { organizer } from '../catalog/service';
import { catalogResult } from '../catalog/contract';
import { supabaseServer } from '@/lib/supabase/server';
import { optionsSchema,optionMutationSchema } from './core';
import { demoTicketOptions,demoSaveTicketOption } from '../booking/service';
export async function ticketOptions(id:string){
 const user=await organizer();if(user.mode==='demo')return demoTicketOptions(user.id,id);
 const {data,error}=await (await supabaseServer()).rpc('ticket_options',{p_event:id});
 return optionsSchema.parse(catalogResult(data,error));
}
export async function saveTicketOption(id:string,raw:unknown){
 const user=await organizer(),input=optionMutationSchema.parse(raw);
 if(user.mode==='demo')return demoSaveTicketOption(user.id,id,input);
 const {data,error}=await (await supabaseServer()).rpc('manage_ticket_option',{p_event:id,p_kind:input.kind,p_id:input.id??null,p_version:input.expectedVersion,p_data:input.data});
 return optionsSchema.parse(catalogResult(data,error));
}
