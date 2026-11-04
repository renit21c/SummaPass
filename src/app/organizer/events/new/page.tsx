import { requireSession } from '@/lib/auth/session';
import { organizer } from '@/features/catalog/service';
import { EventEditor } from '@/features/catalog/editor';
export default async function NewEvent(){await requireSession('/organizer/events/new');await organizer();return <EventEditor now={new Date().toISOString()}/>;}
