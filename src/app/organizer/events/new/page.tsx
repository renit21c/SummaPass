import { requireSession } from '@/lib/auth/session';
import { organizer } from '@/features/catalog/service';
import { EventEditor } from '@/features/catalog/editor';
export default async function NewEvent(){const user=await requireSession('/organizer/events/new');await organizer();return <EventEditor mode={user.mode} now={new Date().toISOString()}/>;}
