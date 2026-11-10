'use client';
import { useEffect,useRef,useState } from 'react';
import { usePathname } from 'next/navigation';
import { Download,X } from 'lucide-react';
import './pwa-install.css';

interface InstallEvent extends Event{
 prompt:()=>Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
const dismissalKey='summapass-install-dismissed-until';
export function PwaInstall(){
 const [available,setAvailable]=useState(false),[ios,setIos]=useState(false),[mobile,setMobile]=useState(false);
 const [ready,setReady]=useState(false),[installed,setInstalled]=useState(false),[dismissed,setDismissed]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[instructions,setInstructions]=useState(false),[embedded,setEmbedded]=useState(false);
 const prompt=useRef<InstallEvent|null>(null);
 const pathname=usePathname();
 useEffect(()=>{
  const standalone=window.matchMedia('(display-mode: standalone)'),smallScreen=window.matchMedia('(max-width: 767px)');
  const isInstalled=()=>standalone.matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
  const isIos=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isMobileDevice=isIos||/Android/i.test(navigator.userAgent);
  setIos(isIos);setEmbedded(/FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent));
  setMobile(isMobileDevice||smallScreen.matches);setInstalled(isInstalled());setReady(true);
  try{setDismissed(Number(localStorage.getItem(dismissalKey)??0)>Date.now());}catch{/* A storage preference is optional. */}
  const onViewport=()=>setMobile(isMobileDevice||smallScreen.matches);
  const onDisplay=()=>setInstalled(isInstalled());
  const beforeInstall=(event:Event)=>{event.preventDefault();if(isInstalled())return;prompt.current=event as InstallEvent;setAvailable(true);};
  const onInstalled=()=>{prompt.current=null;setAvailable(false);setInstalled(true);setInstructions(false);setMessage('SummaPass berhasil di-install.');};
  window.addEventListener('beforeinstallprompt',beforeInstall);window.addEventListener('appinstalled',onInstalled);
  standalone.addEventListener('change',onDisplay);smallScreen.addEventListener('change',onViewport);
  if(process.env.NODE_ENV==='production'&&'serviceWorker' in navigator&&window.isSecureContext){
   void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>console.warn('Service worker SummaPass belum dapat didaftarkan.'));
  }
  return()=>{window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',onInstalled);standalone.removeEventListener('change',onDisplay);smallScreen.removeEventListener('change',onViewport);};
 },[]);
 function dismiss(){
  setDismissed(true);setInstructions(false);setMessage('');
  try{localStorage.setItem(dismissalKey,String(Date.now()+7*86400000));}catch{/* Still dismissed for this visit. */}
 }
 async function install(){
  if(ios||!prompt.current){setInstructions(true);return;}
  const event=prompt.current;setBusy(true);setMessage('');
  try{
   await event.prompt();const choice=await event.userChoice;
   prompt.current=null;setAvailable(false);
   if(choice.outcome==='dismissed')dismiss();
   else{setDismissed(true);setInstructions(false);}
  }catch{setInstructions(true);setMessage('Popup install belum dapat dibuka. Gunakan menu browser.');}
  finally{setBusy(false);}
 }
 if(!ready)return null;
 const activeFlow=/^\/bookings\//.test(pathname)||/\/seats\/?$/.test(pathname)||pathname==='/staff';
 const showBanner=!installed&&mobile&&!activeFlow&&(!dismissed||instructions);
 const help=embedded?'Buka SummaPass di Chrome (Android) atau Safari (iPhone) terlebih dahulu. Browser dalam aplikasi mungkin tidak menyediakan menu install.':ios?'Di Safari, ketuk Bagikan, lalu pilih Tambahkan ke Layar Utama dan Tambah.':'Di Chrome, buka menu tiga titik, pilih Tambahkan ke layar utama atau Install aplikasi, lalu ikuti petunjuknya.';
 return <>
  <div className="pwa-install no-print">
   {!installed&&(available||mobile)&&<button type="button" className="button button-light button-small" disabled={busy} onClick={()=>void install()}><Download size={17} aria-hidden="true"/>{busy?'Memproses...':'Install SummaPass'}</button>}
   {message&&!showBanner&&<p role="status">{message}</p>}
   {instructions&&!showBanner&&!installed&&<p role="status">{help}</p>}
  </div>
  {showBanner&&<section className="pwa-mobile-banner no-print" aria-labelledby="pwa-mobile-title">
   <img src="/pwa/icon-192.png" alt="" width="46" height="46"/>
   <div className="pwa-mobile-copy"><h2 id="pwa-mobile-title">Pasang SummaPass</h2><p>Akses event dan tiket langsung dari layar utama.</p></div>
   <button className="pwa-mobile-close" type="button" aria-label="Tutup ajakan install selama 7 hari" onClick={dismiss}><X size={18} aria-hidden="true"/></button>
   <div className="pwa-mobile-actions"><button type="button" className="button button-small" disabled={busy} onClick={()=>void install()}>{busy?'Memproses...':'Install SummaPass'}<Download size={16} aria-hidden="true"/></button><button type="button" className="pwa-mobile-later" onClick={dismiss}>Nanti saja</button></div>
   {instructions&&<p className="pwa-mobile-instructions" role="status">{help}</p>}
   {message&&<p className="pwa-mobile-instructions" role="status">{message}</p>}
  </section>}
 </>;
}
