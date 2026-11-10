'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyReference({ value, label = 'Salin nomor pesanan' }: { value:string; label?:string }) {
  const [copied,setCopied]=useState(false),[error,setError]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <span className="reference-copy"><button data-icon-action="" type="button" aria-label={copied?'Tersalin':label} title={copied?'Tersalin':label} onClick={async()=>{
    try{await navigator.clipboard.writeText(value);setCopied(true);setError(false);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2500);}
    catch{setError(true);}
  }}>{copied?<Check size={18} aria-hidden="true"/>:<Copy size={18} aria-hidden="true"/>}</button><span className={error?'reference-copy-error':'sr-only'} role="status">{error?'Belum bisa disalin. Pilih dan salin nomornya secara manual.':copied?'Nomor berhasil disalin.':''}</span></span>;
}
