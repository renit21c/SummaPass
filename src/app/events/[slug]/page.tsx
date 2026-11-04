import { publicEvent } from '@/features/catalog/service';
export const dynamic='force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin, Clock3 } from 'lucide-react';
import { events, dateLabel, rupiah } from '@/features/events/data';
import { Poster } from '@/components/poster';

export default async function EventDetail({params}:{params:Promise<{slug:string}>}){const {slug}=await params; const event=await publicEvent(slug);if(!event)notFound();return <main id="main" className="container section"><Link className="text-link back" href="/events"><ArrowLeft size={17}/>Kembali ke event</Link><div className="detail-grid"><div className="detail-poster-column"><Poster event={event} large/></div><div className="detail-copy"><h1>{event.title}</h1><span className="category-badge">{event.category}</span><div className="detail-facts"><p><CalendarDays size={19}/>{dateLabel(event.date)}</p><p><Clock3 size={19}/>{event.time}</p><p><MapPin size={19}/>{event.area??'Summarecon Mall Bandung'}</p></div><h2>Tentang acara</h2><p>{event.description}</p><h2>Penyelenggara</h2><p>{event.organizer}</p><h2>Ketentuan</h2><p style={{whiteSpace:'pre-line'}}>{event.rules}</p><div className="booking-preview"><span>Harga demo mulai dari</span><strong>{rupiah(event.price)}</strong><p>Reservasi berlaku 10 menit. Bayar lewat simulasi.</p><Link className="button" href={`/events/${event.slug}/seats`}>Pilih kursi</Link></div></div></div></main>}
