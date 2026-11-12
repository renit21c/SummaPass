import { publicCatalog } from '@/features/catalog/service';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { Asterisk, ArrowRight, ArrowUpRight, MapPin, Ticket, ScanLine, MousePointer2 } from 'lucide-react';
import { Explorer } from '@/features/events/explorer';
import { PhoneHero } from '@/features/events/phone-hero';
import { ScrollReveal } from '@/components/scroll-reveal';
import './home-hero.css';

const marqueeItems = ['MUSIK', 'WORKSHOP', 'KELUARGA', 'MUSIK', 'WORKSHOP', 'KELUARGA'];

export default async function Home() {
  return <main id="main">
    <section className="hero"><div className="container hero-grid"><div className="hero-copy"><h1>Cari event.<br/>Pesan <span>tiket.</span></h1><p>Musik, workshop, dan acara keluarga di Summarecon Mall Bandung.</p><Link className="button button-dark" href="#events">Lihat event <ArrowUpRight size={19}/></Link><div className="hero-location"><MapPin size={16}/><span>Summarecon Mall Bandung</span></div></div><PhoneHero/></div></section>
    <div className="marquee" aria-hidden="true"><div className="marquee-track">{[0,1].map(copy => <div className="marquee-set" key={copy}>{marqueeItems.map((item,index) => <span className="marquee-item" key={`${copy}-${index}`}>{item}<Asterisk className="marquee-mark" size={18} aria-hidden="true"/></span>)}</div>)}</div></div>
    <section className="container section" id="events"><ScrollReveal className="section-heading"><div><h2>Event tersedia</h2></div><Link className="text-link" href="/events">Semua event <ArrowRight size={18}/></Link></ScrollReveal><Explorer items={await publicCatalog()} animate/></section>
    <section id="cara-kerja" className="how-section"><div className="container"><ScrollReveal className="section-heading"><h2>Cara pesan tiket</h2></ScrollReveal><div className="steps">{[{n:'01',icon:MousePointer2,title:'Pilih event',text:'Cari event dan lihat detailnya.'},{n:'02',icon:Ticket,title:'Pilih kursi dan bayar',text:'Pilih kursi, isi nama, lalu bayar lewat simulasi.'},{n:'03',icon:ScanLine,title:'Tunjukkan tiket',text:'Tunjukkan QR tiket ke petugas saat masuk.'}].map((s,index)=><ScrollReveal className="step" delay={index*90} key={s.n}><div className="step-top"><s.icon size={28}/><span>{s.n}</span></div><h3>{s.title}</h3><p>{s.text}</p></ScrollReveal>)}</div></div></section>
    <section className="container faq section"><ScrollReveal><h2>Pertanyaan umum</h2></ScrollReveal><ScrollReveal delay={90}>{[{q:'Apakah event ini sungguhan?',a:'Tidak. Semua event dan harga adalah data demo.'},{q:'Bagaimana cara mendapatkan tiket?',a:'Pilih kursi, isi nama, lalu selesaikan pembayaran simulasi. Tiket tersedia di Tiket Saya.'},{q:'Apakah perlu mencetak e-ticket?',a:'Tidak wajib. Tunjukkan QR dari ponsel atau cetak tiket.'}].map(f=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</ScrollReveal></section>
  </main>;
}
