'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Ticket, Tag, Ticket as TicketIcon } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import type { Inventory } from './types';
import { calculateApplicablePromo, type Promo } from '@/features/promos/core';
import './quantity-picker.css';

export function QuantityPicker({initial,title,user,initialCategory}:{initial:Inventory;title:string;user:{name:string};initialCategory?:string}){
 const router=useRouter();
 const [data,setData]=useState(initial);
 const [categoryId,setCategoryId]=useState(initial.categories.find(c=>c.id===initialCategory)?.id??initial.categories[0]?.id??'');
 const [quantity,setQuantity]=useState(1),[names,setNames]=useState<string[]>([user.name]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[terms,setTerms]=useState(false);
 const [promos,setPromos]=useState<Promo[]>([]);
 const [voucherCodeInput,setVoucherCodeInput]=useState('');
 const [appliedVoucher,setAppliedVoucher]=useState('');
 const [voucherError,setVoucherError]=useState('');
 const request=useRef({payload:'',key:''});
 const category=data.categories.find(c=>c.id===categoryId);
 const remaining=category?.remaining??category?.quota??0;
 const now=Date.parse(data.serverNow);
 const salesOpen=!!category&&(!category.salesStart||now>=Date.parse(category.salesStart))&&(!category.salesEnd||now<Date.parse(category.salesEnd));
 const limit=Math.min(6,remaining);

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

 const subtotal=(category?.price??0)*quantity;
 const promoCalc=calculateApplicablePromo(
   promos,
   { categoryId, quantity, subtotal },
   appliedVoucher || undefined
 );
 const discountAmount=promoCalc.discountAmount;
 const finalTotal=promoCalc.finalTotal;

 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||!terms||!category||quantity>limit||!salesOpen)return;
  const payload={
    slug:initial.slug,
    categoryId,
    attendees:Array.from({length:quantity},(_,i)=>({name:(names[i]??'').trim()})),
    voucherCode:appliedVoucher||undefined
  };
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
     <label>Kategori tiket<select value={categoryId} onChange={e=>{setCategoryId(e.target.value);setQuantity(1);setError('');}}>{data.categories.map(c=>{
       const autoPromo=calculateApplicablePromo(promos.filter(p=>p.type==='AUTOMATIC'),{categoryId:c.id,quantity:1,subtotal:c.price});
       const label=autoPromo.discountAmount>0
         ? `${c.name} · ${rupiah(c.price - autoPromo.discountAmount)} (Diskon ${autoPromo.appliedPromo?.discountType==='PERCENT'?`${autoPromo.appliedPromo.discountValue}%`:rupiah(autoPromo.discountAmount)})`
         : `${c.name} · ${rupiah(c.price)}`;
       return <option key={c.id} value={c.id}>{label}</option>;
     })}</select></label>
     <p role="status">{salesOpen?`${remaining.toLocaleString('id-ID')} tiket tersedia`:'Penjualan belum dibuka atau sudah ditutup.'}</p>
     <label>Jumlah tiket<select value={quantity} disabled={!limit||!salesOpen} onChange={e=>{setQuantity(Number(e.target.value));setError('');}}>{Array.from({length:Math.max(1,limit)},(_,i)=><option value={i+1} key={i+1}>{i+1} tiket</option>)}</select><small>Maksimal 6 tiket per pesanan.</small></label>
     <h2>Data peserta</h2>{Array.from({length:quantity},(_,i)=><label key={i}>Nama peserta {i+1}<input autoComplete={i===0?'name':'off'} required maxLength={100} value={names[i]??''} onChange={e=>{const value=e.target.value;setNames(previous=>{const next=[...previous];next[i]=value;return next;});}} pattern=".*\S.*" title="Isi nama peserta."/></label>)}
    </fieldset>
   </section>
   <aside className="quantity-summary">
     <Ticket size={28} aria-hidden="true"/>
     <h2>Ringkasan pesanan</h2>
     <p>{category?.name??'Tiket belum tersedia'} · {quantity} tiket</p>
     <p>Tanpa nomor kursi</p>

     {/* Voucher Form */}
     <div style={{ margin: '12px 0', padding: '10px 12px', background: 'var(--cream)', border: '1.5px solid var(--ink)', borderRadius: 6 }}>
       <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 700, fontSize: 12 }}>
         <Tag size={14} />
         <span>Punya Kode Voucher?</span>
       </div>
       {appliedVoucher ? (
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#dcfce7', border: '1px solid #16a34a', padding: '6px 10px', borderRadius: 4 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#166534' }}>
             <TicketIcon size={14} />
             <span>{appliedVoucher}</span>
           </div>
           <button
             type="button"
             onClick={() => {
               setAppliedVoucher('');
               setVoucherError('');
             }}
             style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
           >
             Hapus
           </button>
         </div>
       ) : (
         <div style={{ display: 'flex', gap: 6 }}>
           <input
             type="text"
             placeholder="KODE VOUCHER"
             value={voucherCodeInput}
             disabled={busy}
             onChange={e => {
               setVoucherCodeInput(e.target.value.toUpperCase());
               setVoucherError('');
             }}
             style={{ flex: 1, textTransform: 'uppercase', padding: '6px 8px', fontSize: 12, border: '1.5px solid var(--ink)', borderRadius: 4, background: '#fff' }}
           />
           <button
             type="button"
             className="button button-small"
             style={{ padding: '6px 10px', fontSize: 12 }}
             disabled={busy || !voucherCodeInput.trim()}
             onClick={() => {
               const code = voucherCodeInput.trim().toUpperCase();
               const check = calculateApplicablePromo(
                 promos,
                 { categoryId, quantity, subtotal },
                 code
               );
               if (check.appliedPromo?.code?.toUpperCase() === code) {
                 setAppliedVoucher(code);
                 setVoucherCodeInput('');
                 setVoucherError('');
               } else {
                 setVoucherError('Kode voucher tidak valid atau syarat belum terpenuhi.');
               }
             }}
           >
             Pakai
           </button>
         </div>
       )}
       {voucherError && <p style={{ margin: '6px 0 0', color: 'var(--red, #e11d48)', fontSize: 11 }}>{voucherError}</p>}
     </div>

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

     <strong className="quantity-total">{rupiah(finalTotal)}</strong>
     <p>Tiket ditahan 10 menit setelah pemesanan berhasil.</p>
     <label className="quantity-terms"><input type="checkbox" required checked={terms} disabled={busy} onChange={e=>setTerms(e.target.checked)}/><span>Saya menyetujui ketentuan event.</span></label>
     {quantity>limit&&<p role="alert">Sisa tiket berubah. Pilih jumlah tiket yang tersedia.</p>}
     {error&&<p className="form-error" role="alert">{error}</p>}
     <button className="button" type="submit" disabled={busy||!terms||quantity>limit||!salesOpen}>{busy?'Memproses...':'Lanjut ke pembayaran'}<ArrowRight size={18} aria-hidden="true"/></button>
   </aside>
  </form>
 </div>;
}
