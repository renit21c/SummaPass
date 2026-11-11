'use client';
import { useEffect,useId,useRef,useState } from 'react';
import { Check,ImagePlus,LoaderCircle,Trash2 } from 'lucide-react';
import { useConfirmation } from '@/components/confirmation-dialog';
import { galleryFileError,MAX_GALLERY_IMAGES,type GalleryImage } from './core';
import './gallery.css';
export function GalleryManager({eventId,disabled=false}:{eventId:string;disabled?:boolean}){
 const [images,setImages]=useState<GalleryImage[]>([]),[captions,setCaptions]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[progress,setProgress]=useState('');
 const ask=useConfirmation(),input=useRef<HTMLInputElement>(null),id=useId();
 const endpoint=`/api/organizer/events/${eventId}/gallery`;
 function accept(items:GalleryImage[]){setImages(items);setCaptions(Object.fromEntries(items.map(i=>[i.id,i.caption])));}
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw Error(body.error??'Galeri belum dapat dimuat.');if(!controller.signal.aborted)accept(body.images);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Galeri belum dapat dimuat.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[endpoint]);
 async function upload(files:File[]){
  if(!files.length||busy||disabled)return;
  setError('');setMessage('');
  if(files.length+images.length>MAX_GALLERY_IMAGES){setError(`Sisa tempat untuk ${MAX_GALLERY_IMAGES-images.length} foto. Maksimal 10 foto per event.`);if(input.current)input.current.value='';return;}
  for(const file of files){const invalid=galleryFileError(file);if(invalid){setError(`${file.name}: ${invalid}`);if(input.current)input.current.value='';return;}}
  setBusy(true);let added=0;
  try{
   for(const file of files){
    setProgress(`Menambahkan foto ${added+1} dari ${files.length}...`);
    const form=new FormData();form.set('photo',file);
    const r=await fetch(endpoint,{method:'POST',body:form}),body=await r.json();
    if(!r.ok)throw Error(body.error??'Foto belum dapat diunggah.');accept(body.images);added++;
   }
   setMessage(`${added} foto ditambahkan.`);
  }catch(e){setError(`${e instanceof Error?e.message:'Foto belum dapat diunggah.'}${added?` ${added} foto sebelumnya sudah tersimpan.`:''}`);}
  finally{setBusy(false);setProgress('');if(input.current)input.current.value='';}
 }
 async function change(image:GalleryImage,remove=false){
  if(busy||disabled)return;
  if(remove&&!await ask('Foto akan dihapus dari galeri acara.',{title:'Hapus foto?',confirmLabel:'Hapus foto',destructive:true}))return;
  setBusy(true);setError('');setMessage('');
  try{
   const r=await fetch(endpoint,{method:remove?'DELETE':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageId:image.id,...(!remove?{caption:captions[image.id]??''}:{})})}),body=await r.json();
   if(!r.ok)throw Error(body.error??'Perubahan belum tersimpan.');accept(body.images);setMessage(body.warning??(remove?'Foto dihapus.':'Keterangan disimpan.'));
  }catch(e){setError(e instanceof Error?e.message:'Perubahan belum tersimpan.');}finally{setBusy(false);}
 }
 return <section className="manage-card gallery-manager" aria-labelledby={`${id}-heading`}>
  <div className="gallery-manager-heading"><div><h2 id={`${id}-heading`}>Galeri acara</h2><p>Foto tampil di bawah cover pada halaman acara.</p></div><span>{images.length} / {MAX_GALLERY_IMAGES} foto</span></div>
  <div className="gallery-upload"><ImagePlus size={28} aria-hidden="true"/><div><label className="button button-light" htmlFor={`${id}-upload`} aria-disabled={disabled||busy||loading||images.length>=MAX_GALLERY_IMAGES}>{busy?<LoaderCircle size={18} className="spin" aria-hidden="true"/>:<ImagePlus size={18} aria-hidden="true"/>}{busy?'Mengunggah...':'Tambah foto'}</label><input ref={input} id={`${id}-upload`} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled||busy||loading||images.length>=MAX_GALLERY_IMAGES} aria-describedby={`${id}-hint`} onChange={e=>void upload(Array.from(e.currentTarget.files??[]))}/><p id={`${id}-hint`}>JPG, PNG, atau WebP. Maksimal 3 MB per foto, minimal 400 × 250 piksel. Bisa pilih beberapa foto.</p></div></div>
  {progress&&<p role="status" className="gallery-feedback">{progress}</p>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  {message&&<p role="status" className="gallery-feedback">{message}</p>}
  {loading?<div className="gallery-manager-grid" aria-label="Memuat galeri" aria-busy="true">{[0,1,2].map(n=><div key={n} className="gallery-loading-tile"/>)}</div>:images.length?<div className="gallery-manager-grid">{images.map((image,index)=><article className="gallery-manager-card" key={image.id}>
   <img src={image.url} alt={image.caption||`Foto acara ${index+1}`} loading="lazy" width={480} height={320}/>
   <div><label htmlFor={`${id}-${image.id}`}>Keterangan foto {index+1}<input id={`${id}-${image.id}`} maxLength={160} value={captions[image.id]??''} disabled={busy||disabled} placeholder="Opsional" onChange={e=>setCaptions(c=>({...c,[image.id]:e.target.value}))}/></label><div className="gallery-manager-actions"><small>{(captions[image.id]??'').length} / 160</small><button type="button" className="icon-button" title="Simpan keterangan" aria-label={`Simpan keterangan foto ${index+1}`} disabled={busy||disabled||captions[image.id]===image.caption} onClick={()=>void change(image)}><Check size={19} aria-hidden="true"/></button><button type="button" className="icon-button gallery-delete" title="Hapus foto" aria-label={`Hapus foto ${index+1}`} disabled={busy||disabled} onClick={()=>void change(image,true)}><Trash2 size={18} aria-hidden="true"/></button></div></div>
  </article>)}</div>:!error&&<p className="gallery-empty">Belum ada foto. Tambahkan foto venue atau kegiatan acara.</p>}
 </section>;
}
