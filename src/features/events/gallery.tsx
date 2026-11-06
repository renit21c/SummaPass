'use client';
import { useEffect, useRef, useState } from 'react';
import { Images, X, ChevronLeft, ChevronRight, ArrowUpRight, Guitar, Paintbrush, Palette, Lightbulb, type LucideIcon } from 'lucide-react';

type GalleryItem = { title:string; caption:string; category:string; tone:string; icon:LucideIcon };
const items:GalleryItem[] = [
  {title:'Panggung akustik',caption:'Ilustrasi panggung musik dan pertunjukan akustik.',category:'Musik',tone:'pink',icon:Guitar},
  {title:'Workshop keramik',caption:'Ilustrasi kegiatan membuat keramik.',category:'Workshop',tone:'mint',icon:Paintbrush},
  {title:'Aktivitas keluarga',caption:'Ilustrasi kegiatan seni untuk keluarga.',category:'Keluarga',tone:'yellow',icon:Palette},
  {title:'Tata cahaya panggung',caption:'Ilustrasi pencahayaan untuk pertunjukan malam.',category:'Musik',tone:'purple',icon:Lightbulb}
];

export function EventGallery({eventTitle}:{eventTitle:string}) {
  const [selected,setSelected]=useState<number|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const item=selected===null?null:items[selected];
  const Icon=item?.icon;
  useEffect(()=>{
    if(selected===null)return;
    if(!dialog.current?.open)dialog.current?.showModal();
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{document.body.style.overflow=previous;};
  },[selected]);
  const close=()=>{dialog.current?.close();setSelected(null);};
  const move=(step:number)=>setSelected(value=>value===null?null:(value+step+items.length)%items.length);

  return <section className="event-extra event-gallery" aria-labelledby="event-gallery-heading">
    <div className="event-extra-heading">
      <span className="event-extra-icon"><Images size={23} aria-hidden="true"/></span>
      <div><h2 id="event-gallery-heading">Galeri acara</h2><p>Ilustrasi kegiatan. Foto acara belum tersedia.</p></div>
    </div>
    <div className="event-gallery-grid">
      {items.map((entry,index)=>{const EntryIcon=entry.icon;return <button type="button" className={`gallery-tile gallery-tone-${entry.tone}`} key={entry.title} onClick={()=>setSelected(index)} aria-label={`Lihat ilustrasi ${entry.title}`}>
        <span className="gallery-tile-art" aria-hidden="true"><span className="gallery-orbit"/><EntryIcon className="gallery-main-icon" size={54} strokeWidth={1.6}/><ArrowUpRight className="gallery-open-icon" size={19}/></span>
        <span className="gallery-tile-copy"><span>{entry.category}</span><strong>{entry.title}</strong></span>
      </button>;})}
    </div>
    <dialog ref={dialog} className="gallery-dialog" aria-labelledby="gallery-dialog-title" aria-describedby="gallery-dialog-caption" onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}}}>
      {item&&Icon&&<div className="gallery-dialog-content">
        <button type="button" className="gallery-close" aria-label="Tutup galeri" onClick={close} autoFocus><X size={21} aria-hidden="true"/></button>
        <div className={`gallery-dialog-art gallery-tone-${item.tone}`}><Icon size={100} strokeWidth={1.4} aria-hidden="true"/></div>
        <h3 id="gallery-dialog-title">{item.title}</h3><p id="gallery-dialog-caption">{item.caption}</p><p className="gallery-event-name">{eventTitle}</p>
        <div className="gallery-dialog-nav"><button type="button" className="icon-button" aria-label="Ilustrasi sebelumnya" onClick={()=>move(-1)}><ChevronLeft size={21} aria-hidden="true"/></button><span aria-live="polite">{selected!+1} / {items.length}</span><button type="button" className="icon-button" aria-label="Ilustrasi selanjutnya" onClick={()=>move(1)}><ChevronRight size={21} aria-hidden="true"/></button></div>
      </div>}
    </dialog>
  </section>;
}
