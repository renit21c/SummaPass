'use client';
import { DiscountPrice } from '@/features/promos/price';
import { VoucherInput } from '@/features/promos/voucher-input';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Ticket, Tag, Ticket as TicketIcon } from 'lucide-react';
import { PackagePicker } from '@/features/ticket-options/package-picker';
import { rupiah } from '@/features/events/data';
import type { Inventory } from './types';
import { calculateApplicablePromo, type Promo } from '@/features/promos/core';
import './quantity-picker.css';

export function QuantityPicker({initial,title,user,initialCategory}:{initial:Inventory;title:string;user:{name:string};initialCategory?:string}){
 const router=useRouter();
 const [data,setData]=useState(initial);
 const [categoryId,setCategoryId]=useState(initial.categories.find(c=>c.id===initialCategory)?.id??initial.categories[0]?.id??'');
 const [packageId,setPackageId]=useState('');
 const [quantity,setQuantity]=useState(1),[names,setNames]=useState<string[]>([user.name]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[terms,setTerms]=useState(false);
 const [promos,setPromos]=useState<Promo[]>([]);
 const [voucherBusy,setVoucherBusy]=useState(false);
 const [appliedVoucher,setAppliedVoucher]=useState('');
 const request=useRef({payload:'',key:''});
 const category=data.categories.find(c=>c.id===categoryId);
 const pack=category?.packages?.find(p=>p.id===packageId)??category?.packages?.[0];
 const participantCount=quantity*(pack?.participants??1);
 const remaining=category?.remaining??category?.quota??0;
 const now=Date.parse(data.serverNow);
 const salesOpen=!!category&&(!category.packages||!!pack)&&(!category.salesStart||now>=Date.parse(category.salesStart))&&(!category.salesEnd||now<Date.parse(category.salesEnd));
 const limit=Math.min(6,Math.floor(30/(pack?.participants??1)),Math.floor(remaining/(pack?.participants??1)),pack?.remaining??6);
 useEffect(()=>{
  fetch(`/api/events/${initial.slug}/promos`)
    .then(r=>r.json())
    .then(d=>{
      const list = Array.isArray(d?.promos) ? d.promos : Array.isArray(d) ? d : [];
      setPromos(list);
    })
    .catch(()=>{});
 },[initial.slug]);

 useEffect(()=>{
  let active=true;
  async function refresh(){try{const r=await fetch(`/api/events/${initial.slug}/seats`,{cache:'no-store'});if(r.ok&&active)setData(await r.json());}catch{}}
  const timer=setInterval(()=>void refresh(),5000);window.addEventListener('focus',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[initial.slug]);

 const subtotal=(pack?.price??category?.price??0)*quantity;
 const promoCalc=calculateApplicablePromo(
   promos,
   { categoryId, quantity:participantCount, subtotal },
   appliedVoucher || undefined
 );
 const discountAmount=promoCalc.discountAmount;
 const finalTotal=promoCalc.finalTotal;

 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||voucherBusy||!terms||!category||quantity>limit||!salesOpen)return;
  const payload={slug:initial.slug,categoryId,voucherCode:appliedVoucher||undefined,...(pack?{packageId:pack.id,packageQuantity:quantity}:{}),attendees:Array.from({length:participantCount},(_,i)=>({name:(names[i]??'').trim()}))};
  const encoded=JSON.stringify(payload);
  if(request.current.payload!==encoded)request.current={payload:encoded,key:crypto.randomUUID()};
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,key:request.current.key})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error??'Pemesanan belum berhasil.');
   router.push(`/bookings/${result.id}`);
  }catch(e){setError(e instanceof Error?e.message:'Pemesanan belum berhasil. Coba lagi.');setBusy(false);}
 }
 return <div className="quantity-booking">
  <div className="seat-page-heading"><div><h1>Pesan tiket</h1><p>{title}</p></div><span className="seat-mode">Tanpa nomor kursi</span></div>
  <form className="quantity-layout" onSubmit={e=>void submit(e)}>
   <section className="quantity-details"><h2>Pilih tiket</h2><p>Event ini tidak menggunakan pilihan kursi.</p>
    <fieldset disabled={busy}><legend>Detail tiket dan peserta</legend>
     <label>Kategori tiket<select value={categoryId} onChange={e=>{setCategoryId(e.target.value);setPackageId('');setQuantity(1);setError('');}}>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name} · {rupiah(c.price)}</option>)}</select></label>
     <p role="status">{salesOpen?`${remaining.toLocaleString('id-ID')} tiket tersedia`:'Penjualan belum dibuka atau sudah ditutup.'}</p>
     {pack?<PackagePicker packages={category?.packages??[]} selected={pack} quantity={quantity} remaining={remaining} promos={promos} categoryId={categoryId} busy={busy} onChange={(id,count)=>{setPackageId(id);setQuantity(count);setError('');}}/>:<label>Jumlah tiket<select value={quantity} disabled={!limit||!salesOpen} onChange={e=>{setQuantity(Number(e.target.value));setError('');}}>{Array.from({length:Math.max(1,limit)},(_,i)=><option value={i+1} key={i+1}>{i+1} tiket</option>)}</select><small>Maksimal 6 tiket per pesanan.</small></label>}
     <h2>Data peserta</h2>{Array.from({length:participantCount},(_,i)=><label key={i}>Nama peserta {i+1}<input autoComplete={i===0?'name':'off'} required maxLength={100} value={names[i]??''} onChange={e=>{const value=e.target.value;setNames(previous=>{const next=[...previous];next[i]=value;return next;});}} pattern=".*\S.*" title="Isi nama peserta."/></label>)}
    </fieldset>
   </section>
   <aside className="quantity-summary">
     <Ticket size={28} aria-hidden="true"/>
     <h2>Ringkasan pesanan</h2>
     <p>{category?.name??'Tiket belum tersedia'} · {participantCount} tiket{pack?` · ${quantity} paket ${pack.name}`:''}</p>
     <p>Tanpa nomor kursi</p>

     <VoucherInput slug={initial.slug} categoryId={categoryId} quantity={participantCount} packageId={pack?.id} packageQuantity={pack?quantity:undefined} disabled={busy} code={appliedVoucher} onCode={setAppliedVoucher} onPromos={setPromos} onPending={setVoucherBusy} invalidMessage={promoCalc.voucherError}/>

     <div style={{ display: 'grid', gap: 4, margin: '10px 0', fontSize: 13 }}>
       <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
         <span>Subtotal</span>
         <span>{rupiah(subtotal)}</span>
       </div>
       {discountAmount > 0 && (
         <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red, #e11d48)', fontWeight: 700 }}>
           <span>Diskon ({promoCalc.appliedPromo?.name})</span>
           <span>- {rupiah(discountAmount)}</span>
         </div>
       )}
     </div>

     <DiscountPrice className="quantity-total" price={finalTotal} originalPrice={discountAmount>0?subtotal:undefined}/>
     <p>Tiket ditahan 10 menit setelah pemesanan berhasil.</p>
     <label className="quantity-terms"><input type="checkbox" required checked={terms} disabled={busy} onChange={e=>setTerms(e.target.checked)}/><span>Saya menyetujui ketentuan event.</span></label>
     {quantity>limit&&<p role="alert">Sisa tiket berubah. Pilih jumlah tiket yang tersedia.</p>}
     {error&&<p className="form-error" role="alert">{error}</p>}
     <button className="button" type="submit" disabled={busy||voucherBusy||!terms||quantity>limit||!salesOpen||!!promoCalc.voucherError}>{busy?'Memproses...':'Lanjut ke pembayaran'}<ArrowRight size={18} aria-hidden="true"/></button>
   </aside>
  </form>
 </div>;
}
