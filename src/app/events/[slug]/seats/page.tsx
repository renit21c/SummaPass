import { publicEvent } from '@/features/catalog/service';
export const dynamic='force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { events } from '@/features/events/data';
import { requireSession } from '@/lib/auth/session';
import { inventory } from '@/features/booking/service';
import { SeatPicker } from '@/features/booking/seat-picker';
export const metadata={title:'Pilih kursi'};
export default async function SeatsPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const event=await publicEvent(slug);if(!event)notFound();await requireSession(`/events/${slug}/seats`);let data;try{data=await inventory(slug);}catch{return <main id="main" className="container section empty-state"><h1>Peta kursi belum tersedia.</h1><p>Coba muat ulang daftar kursi.</p><Link className="button" href={`/events/${slug}/seats`}>Coba lagi</Link></main>;}const realtime=data.mode==='supabase'?{url:process.env.NEXT_PUBLIC_SUPABASE_URL!,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!}:undefined;return <main id="main" className="container section"><Link className="text-link back" href={`/events/${slug}`}>Kembali ke detail event</Link><SeatPicker initial={data} title={event.title} realtime={realtime}/></main>;}
