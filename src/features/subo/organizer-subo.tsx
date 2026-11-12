'use client';
import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import { useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { Bot,X,ArrowUpRight,TrendingUp,Download,ChartNoAxesCombined,ChevronLeft,LoaderCircle,Users,Clock3,UserCheck,GitCompareArrows } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import { organizerSummarySchema,organizerDetailSchema,type OrganizerSummary,type OrganizerDetail } from './organizer-contracts';

type Topic='sales'|'overview'|'csv'|'attendance'|'pending'|'staff'|'compare';
const topics=[
 {id:'sales',label:'Event dengan sales tertinggi',icon:TrendingUp},
 {id:'overview',label:'Ringkasan penjualan',icon:ChartNoAxesCombined},
 {id:'attendance',label:'Jumlah peserta hadir',icon:UserCheck},
 {id:'pending',label:'Pembayaran belum selesai',icon:Clock3},
 {id:'staff',label:'Siapa petugas event?',icon:Users},
 {id:'compare',label:'Bandingkan penjualan event',icon:GitCompareArrows},
 {id:'csv',label:'Unduh laporan CSV',icon:Download}
] as const;
function Metrics({rows}:{rows:[string,string|number][]}){return <dl className="subo-metrics">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}
export function OrganizerSubo(){
 const [open,setOpen]=useState(false),[topic,setTopic]=useState<Topic|null>(null);
 const [data,setData]=useState<OrganizerSummary|null>(null),[selected,setSelected]=useState<string|null>(null);
 const [comparison,setComparison]=useState(['','']);
 const [detail,setDetail]=useState<OrganizerDetail|null>(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState(''),[retry,setRetry]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [period,setPeriod]=useState<'dashboard'|'all'|'month'>('dashboard');
 const [month,setMonth]=useState(()=>new Date(Date.now()+7*3600000).toISOString().slice(0,7));
 const request=useRef<AbortController|null>(null),closeRef=useRef<HTMLButtonElement>(null),triggerRef=useRef<HTMLButtonElement>(null),answerRef=useRef<HTMLDivElement>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{
  if(!open)return;closeRef.current?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus();}};
  document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);
 },[open]);
 useEffect(()=>{if(topic)answerRef.current?.scrollIntoView({block:'nearest'});},[topic]);
 function close(){setOpen(false);triggerRef.current?.focus();}
 function rangeParams(range:OrganizerSummary['range']){const params=new URLSearchParams();if(range.from)params.set('from',range.from);if(range.to)params.set('to',range.to);return params;}
 async function choose(next:Topic,preserve=false){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setTopic(next);if(!preserve){setSelected(null);setComparison(['','']);}setData(null);setDetail(null);setError('');setBusy(true);
  const query=new URLSearchParams();
  if(period==='month')query.set('month',month);
  else if(period==='dashboard'){const params=new URLSearchParams(window.location.search);for(const key of ['from','to'])if(params.get(key))query.set(key,params.get(key)!);}
  try{
   const response=await fetch('/api/subo/organizer?'+query,{cache:'no-store',signal:controller.signal});
   if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error??'Laporan belum dapat dimuat. Coba lagi.');}
   const summary=organizerSummarySchema.parse(await response.json());if(!controller.signal.aborted)setData(summary);
  }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Laporan belum dapat dimuat.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{
  if(!data||!selected||!['attendance','staff'].includes(topic??'')){setDetail(null);return;}
  const controller=new AbortController();
  const params=rangeParams(data.range);params.set('id',selected);params.set('topic',topic!);
  setDetail(null);setDetailError('');setDetailBusy(true);
  void (async()=>{
   try{
    const response=await fetch('/api/subo/organizer/event?'+params,{cache:'no-store',signal:controller.signal});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error??'Data event belum dapat dimuat.');}
    const result=organizerDetailSchema.parse(await response.json());if(!controller.signal.aborted)setDetail(result);
   }catch(err){if(!controller.signal.aborted)setDetailError(err instanceof Error?err.message:'Koneksi terputus.');}
   finally{if(!controller.signal.aborted)setDetailBusy(false);}
  })();
  return()=>controller.abort();
 },[data,selected,topic,retry]);
 const event=data?.events.find(item=>item.id===selected);
 function exportUrl(type:'transactions'|'attendees'|'attendance'){
  const params=rangeParams(data?.range??{});
  if(type==='transactions'){if(event)params.set('event',event.slug);return '/api/organizer/export?'+params;}
  params.set('type',type);return '/api/organizer/events/'+event?.id+'/reports?'+params;
 }
 const compareEvents=comparison.map(id=>data?.events.find(item=>item.id===id));
 const pendingStats=event??data?.totals;
 return <aside className="subo-widget no-print" aria-label="Bantuan Subo organizer">
  {open&&<section className="subo-panel" id="subo-organizer-panel" role="dialog" aria-modal="false" aria-labelledby="subo-organizer-title">
   <header className="subo-header"><span className="subo-avatar"><Bot size={26} aria-hidden="true"/></span><div><h2 id="subo-organizer-title">Subo</h2><p>Asisten organizer</p></div><button ref={closeRef} type="button" className="subo-close" onClick={close} aria-label="Tutup Subo"><X size={20}/></button></header>
   <div className="subo-body">
    <ValidatedForm className="subo-period-filter" onSubmit={event=>{event.preventDefault();if(topic)void choose(topic,true);}}>
     <FieldLabel>Periode laporan<select value={period} onChange={event=>setPeriod(event.target.value as typeof period)}><option value="dashboard">Ikuti filter dashboard</option><option value="all">Semua tanggal</option><option value="month">Pilih bulan</option></select></FieldLabel>
     {period==='month'&&<FieldLabel>Bulan (WIB)<input type="month" required min="2000-01" max="2099-12" value={month} onChange={event=>setMonth(event.target.value)}/></FieldLabel>}
     {topic&&<button type="submit" disabled={busy}>Terapkan periode</button>}
    </ValidatedForm>
    {!topic?<><div className="subo-greeting"><strong>Ada yang bisa aku bantu?</strong><p>Cek penjualan, kehadiran, atau laporan eventmu.</p></div><div className="subo-topics" aria-label="Bantuan organizer">{topics.map(({id,label,icon:Icon})=><button key={id} type="button" onClick={()=>void choose(id)}><Icon size={17} aria-hidden="true"/>{label}<ArrowUpRight size={15} aria-hidden="true"/></button>)}</div></>:
    <div className="subo-answer" ref={answerRef} aria-live="polite" aria-busy={busy}>
     <h3>{topics.find(item=>item.id===topic)?.label}</h3>
     {busy?<p className="subo-loading"><LoaderCircle size={17} className="spin" aria-hidden="true"/>Memuat laporan...</p>:error?<><p role="alert">{error}</p><button className="subo-retry" onClick={()=>void choose(topic,true)}>Coba lagi</button></>:data&&<>
      <p className="subo-period-note">{topic==='staff'?'Penugasan petugas saat ini.':data.range.from||data.range.to?(topic==='attendance'?'Check-in ':'Pemesanan ')+(data.range.from??'awal')+' sampai '+(data.range.to??'sekarang')+' (WIB).':'Semua tanggal.'}{data.mode==='demo'?' Data demo.':''}</p>
      {!data.events.length?<p>Belum ada event yang ditugaskan ke akunmu.</p>:topic==='sales'?<>
       {!data.totals.revenue?<p>Belum ada pembayaran lunas pada periode ini.</p>:<><p><strong>{data.events.filter(item=>item.revenue===data.events[0].revenue).map(item=>item.title).join(', ')}</strong> memiliki pendapatan tertinggi, {rupiah(data.events[0].revenue)}{data.events.filter(item=>item.revenue===data.events[0].revenue).length>1?' per event.':'.'}</p><ol className="subo-ranking">{data.events.filter(item=>item.revenue>0).slice(0,5).map(item=><li key={item.id}><span>{item.title}</span><strong>{rupiah(item.revenue)}</strong><small>{item.sold} tiket lunas</small></li>)}</ol></>}
       <p>Hanya pesanan dikonfirmasi dan pembayaran lunas yang dihitung.</p>
      </>:topic==='overview'?<><Metrics rows={[[ 'Pendapatan lunas',rupiah(data.totals.revenue)],['Tiket lunas',data.totals.sold],['Menunggu pembayaran',data.totals.pending+' pesanan']]}/><p>Dari {data.events.length} event yang ditugaskan.</p></>:
      topic==='compare'?<>
       {data.events.length<2?<p>Perlu minimal dua event untuk dibandingkan.</p>:<><div className="subo-comparison-select">{[0,1].map(index=><FieldLabel key={index}>Event {index+1}<select value={comparison[index]} onChange={e=>setComparison(previous=>previous.map((value,i)=>i===index?e.target.value:value))}><option value="">Pilih event</option>{data.events.map(item=><option key={item.id} value={item.id} disabled={comparison[1-index]===item.id}>{item.title}</option>)}</select></FieldLabel>)}</div>
       {compareEvents[0]&&compareEvents[1]?<><div className="subo-comparison-table"><table><caption>Perbandingan pada periode yang sama</caption><thead><tr><th scope="col">Metrik</th>{compareEvents.map(item=><th key={item!.id} scope="col">{item!.title}</th>)}</tr></thead><tbody><tr><th scope="row">Pendapatan</th>{compareEvents.map(item=><td key={item!.id}>{rupiah(item!.revenue)}</td>)}</tr><tr><th scope="row">Tiket lunas</th>{compareEvents.map(item=><td key={item!.id}>{item!.sold}</td>)}</tr><tr><th scope="row">Pending aktif</th>{compareEvents.map(item=><td key={item!.id}>{item!.pending}</td>)}</tr></tbody></table></div><p>{compareEvents[0].revenue===compareEvents[1].revenue?'Pendapatan kedua event sama.':(compareEvents[0].revenue>compareEvents[1].revenue?compareEvents[0].title:compareEvents[1].title)+' unggul '+rupiah(Math.abs(compareEvents[0].revenue-compareEvents[1].revenue))+'.'}</p></>:<p>Pilih dua event yang berbeda.</p>}</>}
      </>:selected===null?<><p>{topic==='csv'?'Mau laporan untuk event apa?':'Mau cek event apa?'}</p><div className="subo-topics subo-event-options">{(topic==='csv'||topic==='pending')&&<button type="button" onClick={()=>setSelected('all')}>Semua event<ArrowUpRight size={15} aria-hidden="true"/></button>}{data.events.map(item=><button type="button" key={item.id} onClick={()=>setSelected(item.id)}>{item.title}<ArrowUpRight size={15} aria-hidden="true"/></button>)}</div></>:
      <><p><strong>{event?.title??'Semua event'}</strong></p>
       {topic==='pending'&&pendingStats&&<><Metrics rows={[[ 'Pesanan belum dibayar',pendingStats.pending],['Total belum dibayar',rupiah(pendingStats.pendingAmount)]]}/><p>Hanya reservasi yang masih aktif. Pesanan gagal, batal, dan kedaluwarsa tidak dihitung.</p></>}
       {(topic==='attendance'||topic==='staff')&&(detailBusy?<p className="subo-loading"><LoaderCircle size={17} className="spin" aria-hidden="true"/>Memuat data event...</p>:detailError?<><p role="alert">{detailError}</p><button className="subo-retry" onClick={()=>setRetry(value=>value+1)}>Coba lagi</button></>:detail?.topic==='attendance'?<><Metrics rows={[[ 'Hadir pada periode',detail.attended],['Tiket lunas semua tanggal',detail.totalSold],['Belum check-in saat ini',detail.notCheckedIn]]}/><p>Periode memfilter waktu check-in. Jumlah tiket lunas dan belum check-in menampilkan kondisi saat ini.</p></>:detail?.topic==='staff'?<>{detail.staff.length?<><p>{detail.staff.length} petugas ditugaskan.</p><ul className="subo-staff-list">{detail.staff.map((person,index)=><li key={index}><strong>{person.name}</strong><span>Ditugaskan {new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric'}).format(new Date(person.assignedAt))}</span></li>)}</ul></>:<p>Belum ada petugas yang ditugaskan. Undangan yang belum diterima belum termasuk petugas aktif.</p>}<p>Daftar ini tidak difilter berdasarkan bulan.</p></>:null)}
       {topic==='csv'&&<><p>Pilih jenis laporan:</p><div className="subo-links"><a className="subo-link" href={exportUrl('transactions')} download><Download size={16} aria-hidden="true"/>Transaksi CSV</a>{event&&data.mode==='supabase'&&<><a className="subo-link" href={exportUrl('attendees')} download><Download size={16} aria-hidden="true"/>Peserta CSV</a><a className="subo-link" href={exportUrl('attendance')} download><Download size={16} aria-hidden="true"/>Kehadiran CSV</a></>}</div><p>CSV mengikuti tanggal pemesanan. Pilih satu event untuk laporan peserta dan kehadiran.</p></>}
       {event&&topic!=='csv'&&<Link className="subo-link" href={'/organizer/events/'+event.id+'/edit'} onClick={close}>Kelola event<ArrowUpRight size={15} aria-hidden="true"/></Link>}
       <button className="subo-reset" onClick={()=>setSelected(null)}><ChevronLeft size={15} aria-hidden="true"/>Pilih event lain</button>
      </>}
      <Link className="subo-link" href={'/organizer?'+rangeParams(data.range)} onClick={close}>Buka dashboard<ArrowUpRight size={15} aria-hidden="true"/></Link>
     </>}
     <button className="subo-reset" onClick={()=>{request.current?.abort();setTopic(null);setSelected(null);}}><ChevronLeft size={15} aria-hidden="true"/>Kembali ke pilihan</button>
    </div>}
   </div><div className="subo-footer">Data mengikuti akses event dan periode laporanmu.</div>
  </section>}
  <button ref={triggerRef} className="subo-trigger" type="button" aria-label={open?'Tutup Subo':'Buka Subo organizer'} aria-expanded={open} aria-controls="subo-organizer-panel" onClick={()=>open?close():setOpen(true)}><Bot size={26} aria-hidden="true"/></button>
 </aside>;
}
