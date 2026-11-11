'use client';
import { useId,useRef,useState } from 'react';
import { Tag } from 'lucide-react';
import type { Promo,DiscountCalculationResult } from './core';
import './promos.css';
type Props={slug:string;categoryId:string;quantity:number;packageId?:string;packageQuantity?:number;disabled:boolean;code:string;onCode:(value:string)=>void;onPromos:(promos:Promo[])=>void;onPending:(pending:boolean)=>void;invalidMessage?:string|null};
export function VoucherInput({slug,categoryId,quantity,packageId,packageQuantity,disabled,code,onCode,onPromos,onPending,invalidMessage}:Props){
 const id=useId(),[input,setInput]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[hint,setHint]=useState('');
 const context=JSON.stringify({slug,categoryId,quantity,packageId,packageQuantity});const latest=useRef(context);latest.current=context;
 async function apply(){
  const requested=context,voucherCode=input.trim().toUpperCase();if(!voucherCode||loading)return;
  setLoading(true);onPending(true);setError('');setHint('');
  try{
   const r=await fetch(`/api/events/${slug}/promos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({categoryId,quantity,packageId,packageQuantity,voucherCode})});
   const data:DiscountCalculationResult&{promos:Promo[];error?:string}=await r.json();
   if(latest.current!==requested)return;
   if(!r.ok)throw Error(data.error??'Voucher belum dapat diperiksa.');
   if(!data.matchingVoucherPromo)throw Error(data.voucherError??'Voucher tidak tersedia atau syarat belum terpenuhi.');
   onPromos(data.promos);onCode(voucherCode);setInput('');
   if(data.appliedPromoType!=='VOUCHER')setHint('Voucher valid. Diskon otomatis memberikan potongan lebih besar.');
  }catch(e){if(latest.current===requested)setError(e instanceof Error?e.message:'Voucher belum dapat diperiksa.');}finally{setLoading(false);onPending(false);}
 }
 return <div className="promo-voucher">
  {code?<><strong><Tag size={16} aria-hidden="true"/>Kode voucher</strong><div className="promo-voucher-row"><span className="promo-voucher-code">{code}</span><button className="button button-light button-small" type="button" disabled={disabled||loading} onClick={()=>{onCode('');setError('');setHint('');}}>Hapus</button></div></>:<>
   <label htmlFor={id}><Tag size={16} aria-hidden="true"/>Kode voucher</label>
   <div className="promo-voucher-row"><input id={id} placeholder="Masukkan kode" maxLength={30} value={input} disabled={disabled||loading} aria-describedby={error?`${id}-error`:undefined} aria-invalid={!!error} onChange={e=>{setInput(e.target.value.toUpperCase());setError('');}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void apply();}}}/><button className="button button-small" type="button" disabled={disabled||loading||!input.trim()||quantity<1} onClick={()=>void apply()}>{loading?'Memeriksa...':'Pakai'}</button></div>
  </>}
  {(error||invalidMessage)&&<p id={`${id}-error`} role="alert" className="promo-voucher-error">{error||invalidMessage}</p>}
  {hint&&!invalidMessage&&<p role="status">{hint}</p>}
 </div>;
}
