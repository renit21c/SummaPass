'use client';
import { FieldLabel } from '@/components/form-fields';
import type { TicketPackage } from './core';
import { rupiah } from '../events/data';
import './options.css';
import { calculateApplicablePromo,type Promo } from '../promos/core';
import { DiscountPrice } from '../promos/price';
export function PackagePicker({packages,selected,quantity,remaining,busy,onChange,promos=[],categoryId}:{promos?:Promo[];categoryId?:string;packages:TicketPackage[];selected:TicketPackage;quantity:number;remaining:number;busy:boolean;onChange:(id:string,quantity:number)=>void}){
 const limit=Math.min(6,Math.floor(30/selected.participants),Math.floor(remaining/selected.participants),selected.remaining??6);
 return <section className="buyer-packages" aria-label="Jenis paket tiket"><h2>Jenis paket</h2><div className="buyer-package-options">{packages.map(p=>{const quote=calculateApplicablePromo(promos.filter(p=>p.type==='AUTOMATIC'),{categoryId,quantity:p.participants,subtotal:p.price});return <button key={p.id} type="button" aria-pressed={p.id===selected.id} disabled={busy} className={p.id===selected.id?'is-active':''} onClick={()=>onChange(p.id,1)}><strong>{p.name}</strong><span>{p.participants} orang</span><DiscountPrice className="buyer-package-price" price={quote.finalTotal} originalPrice={p.price}/><small>/ paket</small>{p.remaining===0&&<small>Kuota paket habis</small>}</button>;})}</div><FieldLabel>Jumlah paket<select value={quantity} disabled={busy||!limit} onChange={e=>onChange(selected.id,Number(e.target.value))}>{Array.from({length:Math.max(1,limit)},(_,i)=><option key={i+1} value={i+1}>{i+1} paket · {(i+1)*selected.participants} orang</option>)}</select></FieldLabel><p>{quantity} paket {selected.name} untuk {quantity*selected.participants} peserta. Setiap peserta mendapat QR sendiri.</p>{quantity>limit&&<p role="alert">Kuota tidak mencukupi. Kurangi jumlah paket atau pilih paket lain.</p>}</section>;
}
