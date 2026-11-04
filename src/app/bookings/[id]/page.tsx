import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { booking } from '@/features/booking/service';
import { BookingError } from '@/features/booking/types';
import { Reservation } from '@/features/booking/reservation';
export const metadata={title:'Reservasi kamu'};
export default async function BookingPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const user=await requireSession(`/bookings/${id}`);let result;try{result=await booking(user.id,id);}catch(error){if(error instanceof BookingError&&error.status===404)notFound();throw error;}return <main id="main" className="container section"><Reservation initial={result} serverNow={new Date().toISOString()}/></main>;}
