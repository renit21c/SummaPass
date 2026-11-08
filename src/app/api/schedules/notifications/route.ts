import { handleSchedule } from '@vercel/schedules';
import { runNotifications } from '@/features/notifications/worker';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Vercel's schedule/v1beta trigger makes this function private in production.
// The database leases and per-job idempotency keys protect overlapping runs.
export const POST = handleSchedule(async ({ name, executionId }) => {
  const result = await runNotifications();
  if (!result.emailEnabled) {
    throw new Error('Notification email configuration is incomplete or disabled.');
  }
  console.info('notification-schedule', { name, executionId, ...result });
});
