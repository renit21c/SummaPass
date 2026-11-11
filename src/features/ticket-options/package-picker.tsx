'use client';
import type { TicketPackage } from './core';
import { rupiah } from '../events/data';
import './options.css';
export function PackagePicker({packages,selected,quantity,remaining,busy,onChange}:{packages:TicketPackage[];selected:TicketPackage;quantity:number;remaining:number;busy:boolean;onChange:(id:string,quantity:number)=>void}){
 const limit=Math.min(6,Math.floor(30/selected.participants),Math.floor(remaining/selected.participants),selected.remaining??6);
 return <section className="buyer-packages" aria-label="Jenis paket tiket"><h2>Jenis paket</h2><div className="buyer-package-options">{packages.map(p=><button key={p.id} type="button" aria-pressed={p.id===selected.id} disabled={busy} className={p.id===selected.id?'is-active':''} onClick={()=>onChange(p.id,1)}><strong>{p.name}</strong><span>{p.participants} orang</span><span className="buyer-package-price">{rupiah(p.price)}</span><small>/ paket</small>{p.remaining===0&&<small>Kuota paket habis</small>}</button>)}</div><label>Jumlah paket<select value={quantity} disabled={busy||!limit} onChange={e=>onChange(selected.id,Number(e.target.value))}>{Array.from({length:Math.max(1,limit)},(_,i)=><option key={i+1} value={i+1}>{i+1} paket · {(i+1)*selected.participants} orang</option>)}</select></label><p>{quantity} paket {selected.name} untuk {quantity*selected.participants} peserta. Setiap peserta mendapat QR sendiri.</p>{quantity>limit&&<p role="alert">Kuota tidak mencukupi. Kurangi jumlah paket atau pilih paket lain.</p>}</section>;
}
