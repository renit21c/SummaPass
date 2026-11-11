import { z } from 'zod';
export const MAX_PARTICIPANTS=30;
export const ticketPackageSchema=z.object({
 id:z.string(),name:z.string(),participants:z.number().int().min(1).max(10),price:z.number().int().min(0),
 quota:z.number().int().nullable(),remaining:z.number().int().nullable().optional(),active:z.boolean(),isDefault:z.boolean().optional()
});
export type TicketPackage=z.infer<typeof ticketPackageSchema>;
export const ticketCategorySchema=z.object({id:z.string(),name:z.string(),description:z.string().default(''),price:z.number().int(),quota:z.number().int(),salesStart:z.string(),salesEnd:z.string(),active:z.boolean(),sections:z.array(z.string()),packages:z.array(ticketPackageSchema)});
export type TicketCategory=z.infer<typeof ticketCategorySchema>;
export const optionsSchema=z.object({version:z.number().int(),mode:z.enum(['SEATED','GENERAL_ADMISSION']),sections:z.array(z.object({name:z.string(),capacity:z.number().int()})),categories:z.array(ticketCategorySchema)});
export type TicketOptions=z.infer<typeof optionsSchema>;
const categoryData=z.object({name:z.string().trim().min(1,'Nama kategori wajib diisi.').max(80),description:z.string().trim().max(500),price:z.number().int().min(0).max(100000000),quota:z.number().int().min(1).max(2000),salesStart:z.string().datetime({offset:true}),salesEnd:z.string().datetime({offset:true}),active:z.boolean(),sections:z.array(z.string().trim().min(1).max(80)).max(20)}).refine(v=>Date.parse(v.salesStart)<Date.parse(v.salesEnd),'Periode jual harus berurutan.').refine(v=>new Set(v.sections).size===v.sections.length,'Section tidak boleh duplikat.');
const packageData=z.object({categoryId:z.string().min(1).max(100),name:z.string().trim().min(1,'Nama paket wajib diisi.').max(80),participants:z.number().int().min(1).max(10),price:z.number().int().min(0).max(100000000),quota:z.number().int().min(1).max(2000).nullable(),active:z.boolean()});
export const optionMutationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('category'),id:z.string().optional(),expectedVersion:z.number().int().min(0),data:categoryData}),
 z.object({kind:z.literal('package'),id:z.string().optional(),expectedVersion:z.number().int().min(0),data:packageData})
]);
export type OptionMutation=z.infer<typeof optionMutationSchema>;
export function participantPrices(price:number,participants:number,quantity:number){
 return Array.from({length:participants*quantity},(_,i)=>Math.floor(price/participants)+(i%participants<price%participants?1:0));
}
export function adjacentSeats(seats:{id:string;section:string;row:string;number:number;status:string}[],sections:string[],count:number){
 const available=seats.filter(s=>s.status==='AVAILABLE'&&sections.includes(s.section));
 for(const first of available){const group=available.filter(s=>s.section===first.section&&s.row===first.row&&s.number>=first.number&&s.number<first.number+count).sort((a,b)=>a.number-b.number);if(group.length===count)return group.map(s=>s.id);}
 return [];
}
