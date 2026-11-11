'use client';
import { useEffect,useId,useRef,useState } from 'react';
import { X,ChevronLeft,ChevronRight } from 'lucide-react';
import type { GalleryImage } from '../gallery/core';
import '../gallery/gallery.css';

export function EventGallery({eventTitle,images}:{eventTitle:string;images:GalleryImage[]}){
 const [selected,setSelected]=useState<number|null>(null),dialog=useRef<HTMLDialogElement>(null),heading=useId();
 const open=selected!==null,item=selected===null?null:images[selected];
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  dialog.current?.showModal();
  return()=>{document.body.style.overflow=previous;};
 },[open]);
 useEffect(()=>{if(selected!==null&&selected>=images.length){dialog.current?.close();setSelected(null);}},[images.length,selected]);
 const close=()=>{dialog.current?.close();setSelected(null);};
 const move=(step:number)=>setSelected(value=>value===null?null:(value+step+images.length)%images.length);
 if(!images.length)return null;
 return <section className="event-photos" aria-labelledby={heading}>
  <h2 id={heading}>Galeri acara</h2>
  <div className="event-photo-grid">{images.map((image,index)=><button className="event-photo-thumbnail" type="button" key={image.id} aria-label={`Perbesar foto ${index+1}${image.caption?`: ${image.caption}`:''}`} onClick={()=>setSelected(index)}><img src={image.url} alt={image.caption||`Foto ${index+1} acara ${eventTitle}`} width={400} height={300} loading="lazy"/></button>)}</div>
  <dialog ref={dialog} className="event-photo-dialog" aria-labelledby={`${heading}-title`} onClose={()=>setSelected(null)} onClick={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={event=>{if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}}>
   {item&&<div className="event-photo-modal"><button className="event-photo-close" type="button" aria-label="Tutup galeri" onClick={close} autoFocus><X size={21} aria-hidden="true"/></button><img src={item.url} alt={item.caption||`Foto ${selected!+1} acara ${eventTitle}`} width={1600} height={1000}/><h3 id={`${heading}-title`}>{item.caption||`Foto ${selected!+1}`}</h3><p>{eventTitle}</p><div className="event-photo-navigation"><button type="button" aria-label="Foto sebelumnya" disabled={images.length<2} onClick={()=>move(-1)}><ChevronLeft size={21} aria-hidden="true"/></button><span aria-live="polite">{selected!+1} / {images.length}</span><button type="button" aria-label="Foto selanjutnya" disabled={images.length<2} onClick={()=>move(1)}><ChevronRight size={21} aria-hidden="true"/></button></div></div>}
  </dialog>
 </section>;
}
