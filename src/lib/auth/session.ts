import 'server-only';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { authMode, safeReturnPath } from './config';
import { supabaseServer } from '@/lib/supabase/server';
import { roleDestination } from './destination';
export type Session = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  preferences?: { emailNotify?: boolean; interestedCategories?: string[] };
  mode: 'demo' | 'supabase';
  demoRole?: 'ORGANIZER' | 'STAFF';
};
const cookieName = 'summapass_demo_session';
// Demo personas are explicit server presets, never used for Supabase authorization.
const memory = globalThis as typeof globalThis & { summaSessions?: Map<string, { user: Session; expires: number }> };
const sessions = memory.summaSessions ??= new Map();
export function hasDemoSession(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  for (const [token, session] of sessions) {
    if (session.expires <= Date.now()) {
      sessions.delete(token);
    } else if (session.user.email.trim().toLowerCase() === normalizedEmail) {
      return true;
    }
  }
  return false;
}
export async function createDemoSession(role?:string) {
  const token = randomBytes(32).toString('hex');
  const user: Session = { id: role==='organizer'?'d0000000-0000-4000-8000-000000000001':crypto.randomUUID(), email: 'pengunjung@example.test', name: role==='staff'?'Petugas Demo':role==='organizer'?'Organizer Demo':'Pengunjung Demo', mode: 'demo', ...(role==='staff'?{demoRole:'STAFF' as const}:role==='organizer'?{demoRole:'ORGANIZER' as const}:{}) };
  for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
  sessions.set(token, { user, expires: Date.now() + 8 * 60 * 60 * 1000 });
  (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.SUMMAPASS_COOKIE_SECURE === 'true', path: '/', maxAge: 8 * 60 * 60 });
}
export async function createCustomDemoSession(custom: { name: string; email: string; phone?: string; role?: string }) {
  const token = randomBytes(32).toString('hex');
  const user: Session = {
    id: crypto.randomUUID(),
    email: custom.email,
    name: custom.name,
    phone: custom.phone,
    mode: 'demo',
    ...(custom.role === 'staff' ? { demoRole: 'STAFF' as const } : custom.role === 'organizer' ? { demoRole: 'ORGANIZER' as const } : {})
  };
  for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
  sessions.set(token, { user, expires: Date.now() + 8 * 60 * 60 * 1000 });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.SUMMAPASS_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 8 * 60 * 60
  });
  return user;
}
export async function updateSessionProfile(data: { email?: string; name?: string; phone?: string; preferences?: { emailNotify?: boolean; interestedCategories?: string[] } }) {
  if (authMode() === 'demo') {
    const token = (await cookies()).get(cookieName)?.value;
    const record = token ? sessions.get(token) : undefined;
    if (!record || record.expires <= Date.now()) return null;
    if (data.name) record.user.name = data.name;
    if (data.email) record.user.email = data.email;
    if (data.phone !== undefined) record.user.phone = data.phone;
    if (data.preferences) record.user.preferences = { ...record.user.preferences, ...data.preferences };
    return record.user;
  }
  const client = await supabaseServer();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  if (data.name) {
    await client.from('profiles').update({ display_name: data.name }).eq('id', user.id);
  }
  const updatePayload: { email?: string; data?: Record<string, unknown> } = {};
  if (data.email && data.email !== user.email) {
    updatePayload.email = data.email;
  }
  if (data.phone !== undefined || data.preferences) {
    updatePayload.data = {
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.preferences ? { preferences: data.preferences } : {})
    };
  }
  if (Object.keys(updatePayload).length > 0) {
    await client.auth.updateUser(updatePayload as any);
  }
  return getSession();
}
export async function getSession(): Promise<Session | null> {
  if (authMode() === 'demo') {
    const token = (await cookies()).get(cookieName)?.value;
    const record = token ? sessions.get(token) : undefined;
    if (!record || record.expires <= Date.now()) return null;
    return record.user;
  }
  const client = await supabaseServer();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  const { data } = await client.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? '',
    name: data?.display_name ?? (typeof metadata.display_name === 'string' ? metadata.display_name : 'Pengunjung'),
    phone: typeof metadata.phone === 'string' ? metadata.phone : undefined,
    preferences: metadata.preferences as Session['preferences'],
    mode: 'supabase'
  };
}
export async function requireSession(returnTo = '/account') {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return session;
}
export async function canAccessRole(user: Session, role: 'ORGANIZER' | 'STAFF') {
  if (user.mode === 'demo') return user.demoRole===role;
  const client = await supabaseServer();
  const { data, error } = await client.from('event_access').select('event_id').eq('user_id', user.id).eq('role', role).limit(1);
  return !error && !!data?.length;
}
export async function loginDestination(user: Session, returnTo: unknown = '/account') {
  if (user.mode === 'demo') return roleDestination(user.demoRole ? [user.demoRole] : [], returnTo);
  const client = await supabaseServer();
  const { data, error } = await client.from('event_access').select('role').eq('user_id', user.id).in('role', ['ORGANIZER', 'STAFF']);
  if (error) throw new Error('Akses akun belum dapat diperiksa. Coba lagi.');
  return roleDestination((data ?? []).map(assignment => assignment.role), returnTo);
}
export async function endSession() {
  if (authMode() === 'supabase') await (await supabaseServer()).auth.signOut();
  const store = await cookies(); const token = store.get(cookieName)?.value;
  if (token) sessions.delete(token);
  store.delete(cookieName);
}
