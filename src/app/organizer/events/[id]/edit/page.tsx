import { requireSession } from '@/lib/auth/session';
import { managedEvent } from '@/features/catalog/service';
import { EventEditor } from '@/features/catalog/editor';
import { notFound } from 'next/navigation';
import { BookingError } from '@/features/booking/types';
export default async function EditEvent({params}:{params:Promise<{id:string}>}){await requireSession('/organizer');try{return <EventEditor initial={await managedEvent((await params).id)}/>;}catch(error){if(error instanceof BookingError&&(error.status===403||error.status===404))notFound();throw error;}}
