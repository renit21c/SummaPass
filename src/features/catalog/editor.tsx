'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import { eventFieldLimits, type ManagedEvent } from './core';
import { coverDimensionsError, coverFileError, editorValidation, type EditorValues } from './editor-validation';
import { EventOperations } from '@/features/operations/event-operations';
import { StaffManager } from '@/features/organizer/staff-manager';
const local = (v:string) => new Date(Date.parse(v)+25200000).toISOString().slice(0,16);
const dates = ['startsAt','endsAt','salesStart','salesEnd'];
export function EventEditor({initial,now,mode}:{initial?:ManagedEvent;now?:string;mode?:'demo'|'supabase'}) {
 const router=useRouter();
 const [saved,setSaved]=useState(initial),[busy,setBusy]=useState(false),[duplicating,setDuplicating]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
 const [submitted,setSubmitted]=useState(false),[touched,setTouched]=useState<Record<string,boolean>>({});
 const [values,setValues]=useState<EditorValues>(()=>({title:initial?.title??'',description:initial?.description??'',category:initial?.category??'Musik',organizer:initial?.organizer??'SummaPass Demo',area:initial?.area??'Summarecon Mall Bandung',startsAt:initial?local(initial.startsAt):'',endsAt:initial?local(initial.endsAt):'',salesStart:initial?local(initial.salesStart):now?local(now):'',salesEnd:initial?local(initial.salesEnd):'',price:String(initial?.price??75000),frontPrice:String(initial?.frontPrice??125000),regularQuota:String(initial?.regularQuota??24),frontQuota:String(initial?.frontQuota??24),rules:initial?.rules??'Datang 30 menit sebelum acara. Satu tiket untuk satu peserta dan satu kursi.',theme:initial?.theme??'sunset'}));
 const [coverError,setCoverError]=useState(''),[coverBusy,setCoverBusy]=useState(false);
 const coverVersion=useRef(0);
 const validation=editorValidation(values,!!saved?.customSeating);
 const errors:Record<string,string>={...validation.errors,...(coverError?{cover:coverError}:{})};
 const visibleError=(name:string)=>(submitted||touched[name])?errors[name]:undefined;
 function attrs(name:string) {return {id:name,name,value:values[name],'aria-invalid':!!visibleError(name),'aria-describedby':`${name}-hint${visibleError(name)?` ${name}-error`:''}`,onChange:(e:ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>)=>{const value=e.currentTarget.value;setValues(v=>({...v,[name]:value}));setMessage('');},onBlur:()=>setTouched(t=>({...t,...Object.fromEntries((dates.includes(name)?dates:[name]).map(n=>[n,true]))}))};}
 function errorText(name:string) {return visibleError(name)&&<small id={`${name}-error`} className="editor-field-error" aria-live="polite"><AlertCircle size={16} aria-hidden="true"/>{visibleError(name)}</small>;}
 function feedback(name:string,hint:string) {return <><small id={`${name}-hint`} className="editor-hint">{hint}</small>{errorText(name)}</>;}
 function field(name:string,label:string,hint:string,type='text') {
  const limits=eventFieldLimits[name as keyof typeof eventFieldLimits];
  return <label htmlFor={name}>{label}<input {...attrs(name)} type={type} required minLength={limits?.min} maxLength={limits?.max} min={type==='number'?name.endsWith('Quota')?1:0:undefined} max={type==='number'?name.endsWith('Quota')?24:100000000:undefined} step={type==='number'?1:undefined}/>{feedback(name,hint)}</label>;
 }
 function textarea(name:'description'|'rules',label:string,rows:number) {
  const limits=eventFieldLimits[name];
  return <label htmlFor={name}>{label}<textarea {...attrs(name)} required minLength={limits.min} maxLength={limits.max} rows={rows}/><span className="editor-text-meta"><small id={`${name}-hint`} className="editor-hint">{limits.min===1?'Wajib diisi.':`Minimal ${limits.min} karakter.`} Maksimal {limits.max.toLocaleString('id-ID')} karakter.</small><small className="editor-counter">{values[name].trim().length.toLocaleString('id-ID')} / {limits.max.toLocaleString('id-ID')}</small></span>{errorText(name)}</label>;
 }
 async function checkCover(file?:File) {
  const version=++coverVersion.current;setCoverError('');setTouched(t=>({...t,cover:true}));
  if(!file){setCoverBusy(false);return;}
  const error=coverFileError(file);if(error){setCoverError(error);setCoverBusy(false);return;}
  setCoverBusy(true);const url=URL.createObjectURL(file);
  try {const image=new Image();image.src=url;await image.decode();if(version===coverVersion.current)setCoverError(coverDimensionsError(image.naturalWidth,image.naturalHeight)??'');}
  catch {if(version===coverVersion.current)setCoverError('Gambar tidak dapat dibaca. Pilih file lain.');}
  finally {URL.revokeObjectURL(url);if(version===coverVersion.current)setCoverBusy(false);}
 }
 async function submit(form:HTMLFormElement) {
  setSubmitted(true);setMessage('');setFailed(false);
  if(!validation.result.success||coverError||coverBusy){requestAnimationFrame(()=>form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return;}
  const file=new FormData(form).get('cover');setBusy(true);
  try {
   let r=await fetch(saved?`/api/organizer/events/${saved.id}`:'/api/organizer/events',{method:saved?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(validation.result.data)});
   let data=await r.json();if(!r.ok)throw Error(data.error);setSaved(data);
   if(file instanceof File&&file.size){const upload=new FormData();upload.set('cover',file);r=await fetch(`/api/organizer/events/${data.id}/cover`,{method:'POST',body:upload});data=await r.json();if(!r.ok)throw Error('Detail tersimpan. '+data.error);setSaved(data);const input=form.elements.namedItem('cover');if(input instanceof HTMLInputElement)input.value='';}
   setMessage('Event berhasil disimpan.');setSubmitted(false);setTouched({});
  }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Gagal menyimpan.');}finally{setBusy(false);}
 }
 async function action(action:string) {
  if(!saved||!confirm('Ubah status event? Pastikan perubahan sudah disimpan.'))return;
  setBusy(true);setMessage('');setFailed(false);
  try {const r=await fetch(`/api/organizer/events/${saved.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const data=await r.json();if(!r.ok)throw Error(data.error);setSaved(data);setMessage('Status event diperbarui.');}
  catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Gagal.');}finally{setBusy(false);}
 }
 async function duplicate() {
  if(!saved||duplicating)return;
  setDuplicating(true);setMessage('');setFailed(false);
  try {
   const r=await fetch(`/api/organizer/events/${saved.id}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json'}});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Gagal menduplikasi event.');
   const newId=data.event?.id??data.id;
   router.push(`/organizer/events/${newId}/edit`);
  }catch(e){setFailed(true);setMessage(e instanceof Error?e.message:'Gagal menduplikasi event.');setDuplicating(false);}
 }
 async function removeEvent() {
  if(!saved)return;
  const confirmation=prompt(`Hapus "${saved.title}" beserta seluruh sales, tiket, peserta, dan riwayat check-in?\n\nKetik nama event persis untuk melanjutkan:`);
  if(confirmation===null)return;
  setBusy(true);setMessage('');setFailed(false);
  try{const response=await fetch(`/api/organizer/events/${saved.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation})});const data=await response.json();if(!response.ok)throw Error(data.error||'Gagal menghapus event.');router.push('/organizer');router.refresh();}
  catch(error){setFailed(true);setMessage(error instanceof Error?error.message:'Gagal menghapus event.');setBusy(false);}
 }
 return <main id="main" className="container section event-editor"><Link className="text-link" href="/organizer">Kembali ke organizer</Link><h1>{initial?'Edit event':'Tambah event'}</h1><p>{saved?.cancelledAt?'Status: Dibatalkan':saved?`Status: ${{DRAFT:'Draf',PUBLISHED:'Dipublikasikan',UNPUBLISHED:'Disembunyikan',ARCHIVED:'Diarsipkan'}[saved.status]}`:'Isi detail dan simpan sebagai draf.'}</p>
  <form noValidate onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}}>
   {submitted&&Object.keys(errors).length>0&&<div className="editor-error-summary" role="alert"><AlertCircle size={20} aria-hidden="true"/><div><strong>Periksa isian berikut.</strong><ul>{Object.entries(errors).map(([name,error])=><li key={name}><a href={`#${name}`}>{error}</a></li>)}</ul></div></div>}
   <fieldset disabled={busy||saved?.status==='ARCHIVED'||!!saved?.cancelledAt}>
    <section><h2>Tentang event</h2>{field('title','Nama event','3–120 karakter.')}{textarea('description','Deskripsi',5)}<div className="editor-grid"><label htmlFor="category">Kategori<select {...attrs('category')}>{['Musik','Workshop','Keluarga'].map(x=><option key={x}>{x}</option>)}</select>{feedback('category','Pilih kategori acara.')}</label>{field('organizer','Penyelenggara','Wajib diisi, maksimal 120 karakter.')}{field('area','Lokasi / area','Wajib diisi, maksimal 200 karakter.')}</div></section>
    <section><h2>Jadwal dan penjualan</h2><p>Semua waktu menggunakan WIB (UTC+7).</p><div className="editor-grid">{field('startsAt','Acara mulai','Tanggal dan jam acara dimulai.','datetime-local')}{field('endsAt','Acara selesai','Harus setelah acara mulai.','datetime-local')}{field('salesStart','Penjualan mulai','Harus sebelum penjualan selesai.','datetime-local')}{field('salesEnd','Penjualan selesai','Paling lambat saat acara mulai.','datetime-local')}</div></section>
    <section><h2>Tiket dan kursi</h2>{!saved?.customSeating?<><p>Kapasitas denah: 24 kursi per kategori, total 48 kursi. Perubahan harga berlaku untuk pesanan baru.</p><div className="editor-grid">{field('price','Harga Regular (Rp)','Rp0–Rp100.000.000. Bilangan bulat, tanpa titik atau koma.','number')}{field('regularQuota','Kuota Regular','1–24 kursi. Tidak boleh melebihi kapasitas denah.','number')}{field('frontPrice','Harga Front (Rp)','Rp0–Rp100.000.000. Bilangan bulat, tanpa titik atau koma.','number')}{field('frontQuota','Kuota Front','1–24 kursi. Tidak boleh melebihi kapasitas denah.','number')}</div><small className="editor-hint">Kuota tidak boleh lebih kecil dari jumlah tiket terjual dan reservasi aktif. Sistem memeriksanya saat disimpan.</small></>:<p>Kategori dan denah event ini dikelola melalui konfigurasi denah.</p>}{textarea('rules','Ketentuan peserta',3)}</section>
    <section><h2>Cover event</h2>{saved?.coverUrl&&<img className="editor-cover" src={saved.coverUrl} alt="Cover event saat ini"/>}<label htmlFor="cover">Upload cover<input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={!!coverError} aria-describedby={`cover-hint${coverError?' cover-error':''}`} onChange={e=>{setMessage('');void checkCover(e.currentTarget.files?.[0]);}}/>{feedback('cover','Opsional. JPG, PNG, atau WebP maksimal 5 MB. Minimal 400 × 250 piksel, maksimal 24 MP. Rasio 4:5 disarankan.')}{coverBusy&&<small className="editor-hint" role="status">Memeriksa gambar...</small>}</label><label htmlFor="theme">Warna cover bawaan<select {...attrs('theme')}><option value="sunset">Oranye</option><option value="clay">Merah muda</option><option value="play">Hijau</option><option value="night">Ungu</option></select>{feedback('theme','Dipakai jika tidak ada cover unggahan.')}</label></section>
    <button className="button" type="submit" disabled={coverBusy}>{busy?'Menyimpan...':saved?'Simpan perubahan':'Simpan sebagai draf'}</button>
   </fieldset>
  </form>
  {message&&<p className={`editor-message${failed?' editor-message-error':''}`} role={failed?'alert':'status'}>{failed?<AlertCircle size={20} aria-hidden="true"/>:<CheckCircle2 size={20} aria-hidden="true"/>}{message}</p>}
  {saved?.id&&<>{mode==='supabase'&&<section className="manage-card"><h2>Pengelolaan event</h2><Link className="button" href={'/organizer/events/'+saved.id+'/manage'}>Denah, peserta, laporan, dan pengumuman</Link></section>}<StaffManager eventId={saved.id} mode={mode}/>{mode==='supabase'&&<EventOperations eventId={saved.id} cancelledAt={saved.cancelledAt}/>}</>}
  {saved&&!saved.cancelledAt&&saved.status!=='ARCHIVED'&&<section className="editor-actions"><h2>Publikasi</h2><p>Simpan perubahan sebelum publikasi.</p><button className="button" disabled={busy} onClick={()=>void action(saved.status==='PUBLISHED'?'unpublish':'publish')}>{saved.status==='PUBLISHED'?'Sembunyikan event':'Publikasikan event'}</button>{saved.status==='PUBLISHED'&&<Link className="button button-light" href={`/events/${saved.slug}`}>Lihat event</Link>}<button className="text-link" disabled={busy} onClick={()=>void action('archive')}>Arsipkan setelah acara selesai</button></section>}
 {saved?.id&&<section className="editor-actions"><h2>Duplikasi</h2><p>Buat draf baru dengan menyalin detail, kuota, dan harga dari event ini.</p><button type="button" className="button button-light" disabled={busy||duplicating} onClick={()=>void duplicate()}><Copy size={16} aria-hidden="true"/>{duplicating?'Menduplikasi...':'Duplikat event ini'}</button></section>}
 {saved&&<section className="editor-actions"><h2>Hapus event demo</h2><p>Event, sales, tiket, peserta, notifikasi, dan riwayat check-in akan dihapus permanen. Ketik nama event untuk mengonfirmasi.</p><button type="button" className="button button-light" disabled={busy} onClick={()=>void removeEvent()}>{busy?'Menghapus...':'Hapus event permanen'}</button></section>}
 </main>;
}
