import { requireSession } from '@/lib/auth/session';
import { managedEvent } from '@/features/catalog/service';
import { EventEditor } from '@/features/catalog/editor';
import { notFound } from 'next/navigation';
export default async function EditEvent({params}:{params:Promise<{id:string}>}){await requireSession('/organizer');try{return <EventEditor initial={await managedEvent((await params).id)}/>;}catch{notFound();}}
