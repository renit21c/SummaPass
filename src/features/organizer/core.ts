import type { ManagedEvent } from '../catalog/core';
import type { Booking,Inventory,Category } from '../booking/types';
export const demoOrganizerEvents=['senja-di-summa','clay-and-coffee','little-weekend'];
export type OrganizerSnapshot={events:ManagedEvent[];bookings:Booking[];inventory:Inventory[];mode:'demo'|'supabase';attendance?:{slug:string;checkedIn:number}[]};
export function categoryInventory(inventory:Inventory,category:Category){
 if(inventory.seatingMode==='GENERAL_ADMISSION')return {available:category.remaining??0,reserved:category.reserved??0,sold:category.sold??0};
 const seats=inventory.seats.filter(s=>category.sections.includes(s.section));
 const reserved=seats.filter(s=>s.status==='RESERVED').length,sold=seats.filter(s=>s.status==='SOLD').length;
 return {available:Math.max(0,Math.min(seats.length,category.quota)-reserved-sold),reserved,sold};
}
export function metrics(data:OrganizerSnapshot){const confirmed=data.bookings.filter(b=>b.status==='CONFIRMED'&&b.paymentStatus==='PAID');return {revenue:confirmed.reduce((sum,b)=>sum+b.total,0),sold:data.inventory.reduce((sum,e)=>sum+(e.seatingMode==='GENERAL_ADMISSION'?e.categories.reduce((n,c)=>n+(c.sold??0),0):e.seats.filter(s=>s.status==='SOLD').length),0),available:data.inventory.reduce((sum,e)=>sum+e.categories.reduce((n,c)=>n+categoryInventory(e,c).available,0),0),pending:data.bookings.filter(b=>b.status==='PENDING_PAYMENT').length,bookings:data.bookings.length};}
function cell(value:unknown){const text=String(value??'');return '"'+(/^[\s]*[=+@-]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
export function exportBookings(rows:Booking[]){return '\uFEFF'+[['Referensi','Event','Kategori','Kursi','Peserta','Status','Pembayaran','Harga tiket IDR'],...rows.flatMap(b=>b.items.map(i=>[b.reference,b.slug,b.categoryName,i.label,i.name,b.status,b.paymentStatus??'',i.price]))].map(row=>row.map(cell).join(',')).join('\r\n');}
