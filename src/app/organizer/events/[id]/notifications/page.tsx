import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { managedEvent } from '@/features/catalog/service';
import { QueueDashboard } from '@/features/operations/queue-dashboard';
export default async function NotificationOperations({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id; await requireSession(`/organizer/events/${id}/notifications`);
  const event = await managedEvent(id);
  return <main id="main" className="container section"><Link className="text-link" href={`/organizer/events/${id}/edit`}>Kembali ke event</Link><div className="page-heading"><h1>Email: {event.title}</h1></div><QueueDashboard eventId={event.id} /></main>;
}
