import Link from 'next/link';
import { requireSession, canAccessRole } from '@/lib/auth/session';
export async function ProtectedWorkspace({ role }: { role: 'ORGANIZER' | 'STAFF' }) {
 const user = await requireSession(role === 'ORGANIZER' ? '/organizer' : '/staff');
 const allowed = await canAccessRole(user, role);
 return <main id="main" className="container section empty-state"><h1>{allowed ? (role === 'ORGANIZER' ? 'Ruang organizer' : 'Ruang check-in') : 'Akses terbatas.'}</h1><p>{allowed ? 'Akun memiliki penugasan event. Fitur operasional akan dibangun pada tahap organizer dan check-in.' : 'Akun ini tidak memiliki akses.'}</p><Link href="/account" className="button">Kembali ke akun</Link></main>;
}
