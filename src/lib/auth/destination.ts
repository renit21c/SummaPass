import { safeReturnPath } from './config';

// Inputs must come from the authenticated server session and event_access,
// never from form fields or editable user metadata.
export function roleDestination(roles: readonly string[], returnTo: unknown = '/account') {
  const next=safeReturnPath(returnTo);
  if (/^\/staff\/invitations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next)) return next;
  if (roles.includes('ORGANIZER')) return '/organizer';
  if (roles.includes('STAFF')) return '/staff';
  return safeReturnPath(returnTo);
}
