'use client';
import { useEffect,useRef,useState } from 'react';
import { Download } from 'lucide-react';

interface InstallEvent extends Event{
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
export function PwaInstall(){
 const [available,setAvailable]=useState(false),[ios,setIos]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const prompt=useRef<InstallEvent|null>(null);
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)');
  const installed=()=>standalone.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
  setIos(!installed()&&(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)));
  const beforeInstall=(event:Event)=>{event.preventDefault();if(installed())return;prompt.current=event as InstallEvent;setAvailable(true);};
  const onInstalled=()=>{prompt.current=null;setAvailable(false);setIos(false);setMessage('SummaPass berhasil di-install.');};
  window.addEventListener('beforeinstallprompt',beforeInstall);window.addEventListener('appinstalled',onInstalled);
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator&&window.isSecureContext){
   void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>console.warn('Service worker SummaPass belum dapat didaftarkan.'));
  }
  return()=>{window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',onInstalled);};
 },[]);
 if(!available&&!ios&&!message)return null;
 return <div className="pwa-install no-print">
  {(available||ios)&&<button type="button" className="button button-light button-small" disabled={busy} onClick={async()=>{
   if(ios){setMessage('Di Safari, pilih Bagikan, lalu Tambahkan ke Layar Utama.');return;}
   const event=prompt.current;if(!event)return;
   setBusy(true);setMessage('');
   try{await event.prompt();await event.userChoice;prompt.current=null;setAvailable(false);}
   catch{setMessage('Buka menu browser, lalu pilih Install aplikasi jika tersedia.');}
   finally{setBusy(false);}
  }}><Download size={17} aria-hidden="true"/>{busy?'Memproses...':'Install SummaPass'}</button>}
  {message&&<p role="status">{message}</p>}
 </div>;
}
