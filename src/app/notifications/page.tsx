import { requireSession } from '@/lib/auth/session';
import { NotificationsContent } from '@/features/notifications/page-content';
export default async function NotificationsPage(){await requireSession('/notifications');return <NotificationsContent/>;}
