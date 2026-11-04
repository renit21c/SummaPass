import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { ticket } from '@/features/booking/service';
import { BookingError } from '@/features/booking/types';
import { events } from '@/features/events/data';
import { TicketCard } from '@/features/tickets/ticket-card';
export const metadata={title:'QR e-ticket',robots:{index:false,follow:false}};
export default async function TicketPage({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!z.string().uuid().safeParse(id).success)notFound();const user=await requireSession(`/my-tickets/${id}`);let result;try{result=await ticket(user.id,id);}catch(error){if(error instanceof BookingError&&error.status===404)notFound();return <main id="main" className="container section empty-state"><h1>Tiket gagal dimuat.</h1><p>Coba lagi atau hubungi penyelenggara.</p><Link href="/my-tickets" className="button">Kembali ke tiket saya</Link></main>;}const event=result.event??events.find(e=>e.slug===result.slug);if(!event)notFound();return <main id="main" className="container section ticket-page"><div className="ticket-page-heading no-print"><Link className="text-link back" href="/my-tickets">Kembali ke tiket saya</Link><h1>Detail tiket</h1><p>Tunjukkan QR ke petugas saat masuk.</p></div><TicketCard ticket={result} event={event}/></main>;}
