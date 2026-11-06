import { z } from 'zod';
export const MAX_SEATS=2000;
const name=z.string().trim().min(1).max(80);
const seat=z.object({row:z.string().trim().min(1).max(12),number:z.number().int().min(1).max(9999),x:z.number().int().min(44).max(9900),y:z.number().int().min(110).max(9900)});
export const categoryFields=z.object({name,price:z.number().int().min(0).max(100000000),quota:z.number().int().min(1).max(MAX_SEATS),salesStart:z.string().datetime({offset:true}),salesEnd:z.string().datetime({offset:true}),sections:z.array(name).min(1).max(20),active:z.boolean()}).refine(c=>Date.parse(c.salesStart)<Date.parse(c.salesEnd),{message:'Periode penjualan tidak valid.'}).refine(c=>new Set(c.sections).size===c.sections.length,{message:'Section kategori tidak boleh duplikat.'});
export const categoryInput=categoryFields.safeExtend({expectedVersion:z.number().int().min(0)});
export const layoutInput=z.object({expectedVersion:z.number().int().min(0),width:z.number().int().min(320).max(10000),height:z.number().int().min(240).max(10000),sections:z.array(z.object({name,seats:z.array(seat).min(1).max(MAX_SEATS)})).min(1).max(20),categories:z.array(categoryFields).min(1).max(30)}).superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 if(new Set(v.sections.map(s=>s.name)).size!==v.sections.length)fail('Nama section harus unik.');
 if(new Set(v.categories.map(c=>c.name)).size!==v.categories.length)fail('Nama kategori harus unik.');
 let total=0;const cells=new Map<string,{x:number;y:number}[]>();
 for(const section of v.sections){const labels=new Set<string>();for(const s of section.seats){total++;const label=s.row+':'+s.number;if(labels.has(label))fail('Nomor kursi dalam baris harus unik.');labels.add(label);if(s.x+44>v.width||s.y+44>v.height)fail('Kursi harus berada di dalam denah.');const x=Math.floor(s.x/44),y=Math.floor(s.y/44);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if((cells.get(`${x+dx}:${y+dy}`)??[]).some(p=>Math.abs(p.x-s.x)<44&&Math.abs(p.y-s.y)<44))fail('Posisi kursi saling bertumpuk.');const key=`${x}:${y}`;cells.set(key,[...(cells.get(key)??[]),s]);}}
 if(total>MAX_SEATS)fail(`Maksimal ${MAX_SEATS} kursi per event.`);
 for(const c of v.categories){const selected=v.sections.filter(s=>c.sections.includes(s.name));if(selected.length!==c.sections.length)fail('Section kategori tidak ditemukan.');if(c.quota>selected.reduce((n,s)=>n+s.seats.length,0))fail('Kuota melebihi kapasitas section.');}
 if(!v.categories.some(c=>c.active))fail('Sediakan minimal satu kategori aktif.');
});
export type LayoutInput=z.infer<typeof layoutInput>;
export type CategoryInput=z.infer<typeof categoryInput>;
export const seatingConfigSchema=z.object({version:z.number().int().min(0),width:z.number().int(),height:z.number().int(),sections:z.array(z.object({id:z.string(),name,seats:z.array(seat.safeExtend({id:z.string()}))})),categories:z.array(categoryFields.safeExtend({id:z.string()}))});
export type SeatingConfig=z.infer<typeof seatingConfigSchema>;
