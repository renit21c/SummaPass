import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { NotificationsCenter } from '@/features/notifications/notifications-center';

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <NotificationsCenter />;
}
