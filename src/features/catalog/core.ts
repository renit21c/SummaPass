import { z } from 'zod';
import type { Event } from '../events/data';
export type ManagedEvent=Event&{cancelledAt?:string|null;cancellationReason?:string|null;customSeating?:boolean;seatingVersion?:number;ownerId?:string;id:string;status:'DRAFT'|'PUBLISHED'|'UNPUBLISHED'|'ARCHIVED';startsAt:string;endsAt:string;salesStart:string;salesEnd:string;frontPrice:number;frontQuota:number;regularQuota:number;rules:string;organizer:string;area:string;coverUrl:string};
export const eventFieldLimits = {
 title: { min: 3, max: 120 }, description: { min: 20, max: 5000 },
 organizer: { min: 1, max: 120 }, area: { min: 1, max: 200 }, rules: { min: 1, max: 3000 },
} as const;
const textField = (label:string, limits:{min:number;max:number}) => z.string().trim()
 .min(limits.min,`${label} minimal ${limits.min} karakter.`).max(limits.max,`${label} maksimal ${limits.max} karakter.`);
const moneyField = (label:string) => z.number({error:`${label} wajib berupa angka.`})
 .int(`${label} harus bilangan bulat.`).min(0,`${label} tidak boleh negatif.`).max(100000000,`${label} maksimal Rp100.000.000.`);
const dateField = (label:string) => z.string().datetime({offset:true,message:`Pilih ${label.toLowerCase()} yang valid (WIB).`});
export const eventInput=z.object({
 title:textField('Nama event',eventFieldLimits.title),description:textField('Deskripsi',eventFieldLimits.description),
 category:z.enum(['Musik','Workshop','Keluarga'],{error:'Pilih kategori yang tersedia.'}),
 startsAt:dateField('Acara mulai'),endsAt:dateField('Acara selesai'),salesStart:dateField('Penjualan mulai'),salesEnd:dateField('Penjualan selesai'),
 price:moneyField('Harga Regular'),frontPrice:moneyField('Harga Front'),
 frontQuota:z.number({error:'Kuota Front wajib berupa angka.'}).int('Kuota Front harus bilangan bulat.').min(1,'Kuota Front minimal 1 kursi.').max(24,'Kuota Front maksimal 24 kursi sesuai kapasitas denah.'),
 regularQuota:z.number({error:'Kuota Regular wajib berupa angka.'}).int('Kuota Regular harus bilangan bulat.').min(1,'Kuota Regular minimal 1 kursi.').max(24,'Kuota Regular maksimal 24 kursi sesuai kapasitas denah.'),
 rules:textField('Ketentuan peserta',eventFieldLimits.rules),organizer:textField('Penyelenggara',eventFieldLimits.organizer),area:textField('Lokasi',eventFieldLimits.area),
 theme:z.enum(['sunset','clay','play','night'],{error:'Pilih warna cover yang tersedia.'}),
}).refine(v=>Date.parse(v.endsAt)>Date.parse(v.startsAt),{path:['endsAt'],message:'Acara selesai harus setelah acara mulai.'})
 .refine(v=>Date.parse(v.salesStart)<Date.parse(v.salesEnd),{path:['salesEnd'],message:'Penjualan selesai harus setelah penjualan mulai.'})
 .refine(v=>Date.parse(v.salesEnd)<=Date.parse(v.startsAt),{path:['salesEnd'],message:'Penjualan harus berakhir paling lambat saat acara mulai.'});
export type EventInput=z.infer<typeof eventInput>;
export function dateParts(startsAt:string){const date=new Date(startsAt);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const part=(type:string)=>parts.find(p=>p.type===type)!.value;return {date:`${part('year')}-${part('month')}-${part('day')}`,time:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)+' WIB'};}
export function seedManaged(e:Event,index:number):ManagedEvent{const startsAt=new Date(`${e.date}T${e.time.replace(' WIB','').replace('.',':')}:00+07:00`).toISOString();return {...e,id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,status:'PUBLISHED',startsAt,endsAt:new Date(Date.parse(startsAt)+3*3600000).toISOString(),salesStart:'2026-10-31T17:00:00.000Z',salesEnd:startsAt,frontPrice:e.price+50000,frontQuota:24,regularQuota:24,rules:'Datang 30 menit sebelum acara. Satu tiket berlaku untuk satu peserta dan satu kursi.',organizer:'SummaPass Demo',area:'Summarecon Mall Bandung',coverUrl:''};}
export const managedSchema=eventInput.safeExtend({cancelledAt:z.string().nullable().optional(),cancellationReason:z.string().nullable().optional(),customSeating:z.boolean().optional(),seatingVersion:z.number().int().min(0).optional(),ownerId:z.string().optional(),id:z.string().uuid(),slug:z.string().regex(/^[a-z0-9-]+$/),status:z.enum(['DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED']),date:z.string(),time:z.string(),headline:z.string(),coverUrl:z.string().refine(v=>!v||/^\/api\/covers\/[a-f0-9-]{36}_[a-f0-9-]{36}\.webp$/.test(v))});
