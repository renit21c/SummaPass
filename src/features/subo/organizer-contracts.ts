import { z } from 'zod';
import { reportRange } from '@/features/organizer/tools-core';

export const suboRange=reportRange.safeExtend({month:z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/).optional()})
 .refine(value=>!value.month||(!value.from&&!value.to),'Pilih bulan atau rentang tanggal.');
export function resolveSuboRange(raw:unknown){
 const input=suboRange.parse(raw);
 if(!input.month)return {from:input.from,to:input.to};
 const [year,month]=input.month.split('-').map(Number);
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();
 return {from:`${input.month}-01`,to:`${input.month}-${last}`};
}
export const organizerSummarySchema=z.object({
 events:z.array(z.object({id:z.string().uuid(),slug:z.string(),title:z.string(),revenue:z.number(),sold:z.number(),pending:z.number(),pendingAmount:z.number()})),
 mode:z.enum(['demo','supabase']),range:z.object({from:z.string().optional(),to:z.string().optional()}),
 totals:z.object({revenue:z.number(),sold:z.number(),pending:z.number(),pendingAmount:z.number()})
});
export type OrganizerSummary=z.infer<typeof organizerSummarySchema>;
export const organizerDetailSchema=z.discriminatedUnion('topic',[
 z.object({topic:z.literal('attendance'),attended:z.number(),totalSold:z.number(),notCheckedIn:z.number()}),
 z.object({topic:z.literal('staff'),staff:z.array(z.object({name:z.string(),assignedAt:z.string()}))})
]);
export type OrganizerDetail=z.infer<typeof organizerDetailSchema>;
