'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { OrganizerSubo } from './organizer-subo';
import { Bot, X, ArrowUpRight, CalendarDays, MapPin, Car, Ticket, ScanLine, Mail, ChevronLeft, LoaderCircle } from 'lucide-react';
import './subo.css';

const maps = 'https://www.google.com/maps/search/?api=1&query=Summarecon+Mall+Bandung';
const topics = [
  { id: 'events', label: 'Event terdekat', icon: CalendarDays },
  { id: 'address', label: 'Alamat dan rute', icon: MapPin },
  { id: 'parking', label: 'Tempat parkir', icon: Car },
  { id: 'booking', label: 'Cara beli tiket', icon: Ticket },
  { id: 'checkin', label: 'Cara check-in', icon: ScanLine },
  { id: 'email', label: 'Email tiket belum masuk', icon: Mail },
] as const;
type Topic = typeof topics[number]['id'];
type EventOption = { slug: string; title: string; startsAt: string; area: string; price: number };
const answers: Record<Exclude<Topic, 'events'>, { text: string; links: { label: string; href: string }[] }> = {
  address: { text: 'Summarecon Mall Bandung berada di Jalan Grand Bulevar No. 1, Rancabolang, Gedebage, Kota Bandung, 40295. Cek lokasi area event di halaman detail acara.', links: [{ label: 'Buka Google Maps', href: maps }, { label: 'Informasi resmi mal', href: 'https://www.summareconmallbandung.com/information/about' }] },
  parking: { text: 'Mobil: ikuti petunjuk gedung parkir. Motor: dekat gedung parkir atau area parkir selatan. Sepeda: area Downtown Walk, masuk dari Jalan Sentra Raya Selatan. Valet: Lobby Ageung. Untuk akses dan tarif terbaru, ikuti arahan petugas mal.', links: [{ label: 'Lihat fasilitas parkir', href: 'https://summareconmallbandung.com/facility' }, { label: 'Rute ke mal', href: maps }] },
  booking: { text: 'Pilih event, lalu kategori tiket dan kursi yang tersedia. Isi data peserta, periksa pesanan, lalu selesaikan pembayaran. Setelah status lunas, e-ticket tersedia di Tiket saya.', links: [{ label: 'Cari event', href: '/events' }, { label: 'Lihat pesanan saya', href: '/bookings' }] },
  checkin: { text: 'Buka e-ticket dan tunjukkan QR kepada petugas di lokasi event. Pastikan tiket sudah lunas. Satu tiket berlaku untuk satu peserta; tiket yang sudah dipakai akan terdeteksi saat dipindai lagi.', links: [{ label: 'Buka tiket saya', href: '/my-tickets' }] },
  email: { text: 'Pastikan pesanan sudah lunas, lalu cek folder Spam atau Promosi. Tiket tetap bisa dibuka dari Tiket saya. Buka detail tiket untuk meminta kirim ulang email. Pengiriman dapat menunggu antrean.', links: [{ label: 'Buka tiket saya', href: '/my-tickets' }, { label: 'Cek status pesanan', href: '/bookings' }] },
};

export function Subo(){const pathname=usePathname();return pathname.startsWith('/organizer')?<OrganizerSubo key={pathname}/>:<VisitorSubo/>;}

function VisitorSubo() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (topic) answerRef.current?.scrollIntoView({ block: 'nearest' }); }, [topic]);

  async function choose(next: Topic) {
    request.current?.abort();
    setTopic(next); setError(''); setLoading(false);
    if (next !== 'events') return;
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setEvents([]);
    try {
      const response = await fetch('/api/subo/events', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw Error('Event belum bisa dimuat. Coba lagi.');
      const data = await response.json();
      if (!controller.signal.aborted) setEvents(data.events);
    } catch { if (!controller.signal.aborted) setError('Event belum bisa dimuat. Coba lagi.'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  function close() { setOpen(false); triggerRef.current?.focus(); }

  return <aside className="subo-widget no-print" aria-label="Bantuan Subo">
    {open && <section className="subo-panel" id="subo-panel" role="dialog" aria-modal="false" aria-labelledby="subo-title">
      <header className="subo-header"><span className="subo-avatar"><Bot size={26} aria-hidden="true" /></span><div><h2 id="subo-title">Subo</h2><p>Asisten SummaPass</p></div><button ref={closeRef} type="button" className="subo-close" onClick={close} aria-label="Tutup Subo"><X size={20} /></button></header>
      <div className="subo-body">
        <div className="subo-greeting"><strong>Hai, aku Subo.</strong><p>Mau cari info apa? Pilih di bawah ini.</p></div>
        <div className="subo-topics" aria-label="Pilihan bantuan">{topics.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={topic === id} onClick={() => void choose(id)}><Icon size={17} aria-hidden="true" />{label}<ArrowUpRight size={15} aria-hidden="true" /></button>)}</div>
        {topic && <div className="subo-answer" ref={answerRef} aria-live="polite" aria-busy={loading}>
          <h3>{topics.find(item => item.id === topic)?.label}</h3>
          {topic === 'events' ? <>
            {loading ? <p className="subo-loading"><LoaderCircle size={17} className="spin" aria-hidden="true" />Mencari event terbaru...</p> : error ? <><p role="alert">{error}</p><button type="button" className="subo-retry" onClick={() => void choose('events')}>Coba lagi</button></> : events.length ? <div className="subo-events">{events.map(event => <Link key={event.slug} href={`/events/${event.slug}`} onClick={close}><strong>{event.title}<ArrowUpRight size={16} aria-hidden="true" /></strong><span>{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.startsAt))} WIB</span><span>{event.area}</span><b>Mulai {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(event.price)}</b></Link>)}</div> : <p>Belum ada event mendatang. Cek lagi nanti, ya.</p>}
            <Link className="subo-link" href="/events" onClick={close}>Lihat semua event<ArrowUpRight size={15} aria-hidden="true" /></Link>
          </> : <><p>{answers[topic].text}</p><div className="subo-links">{answers[topic].links.map(link => link.href.startsWith('/') ? <Link key={link.href} className="subo-link" href={link.href} onClick={close}>{link.label}<ArrowUpRight size={15} aria-hidden="true" /></Link> : <a key={link.href} className="subo-link" href={link.href} target="_blank" rel="noopener noreferrer">{link.label}<ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></a>)}</div></>}
          <button type="button" className="subo-reset" onClick={() => { request.current?.abort(); setTopic(null); }}><ChevronLeft size={15} aria-hidden="true" />Tutup jawaban</button>
        </div>}
      </div>
      <div className="subo-footer">Bantuan cepat, cukup pilih topik.</div>
    </section>}
    <button ref={triggerRef} type="button" className="subo-trigger" aria-label={open ? 'Tutup Subo' : 'Buka Subo'} aria-expanded={open} aria-controls="subo-panel" onClick={() => open ? close() : setOpen(true)}><Bot size={26} aria-hidden="true" /></button>
  </aside>;
}
