import Link from 'next/link';
import { requireSession,canAccessRole } from '@/lib/auth/session';
import { organizerSnapshot } from '@/features/organizer/service';
import { OrganizerDashboard } from '@/features/organizer/dashboard';
export const metadata={title:'Dashboard organizer',robots:{index:false,follow:false}};
export default async function Organizer(){const user=await requireSession('/organizer');if(!await canAccessRole(user,'ORGANIZER'))return <main id="main" className="container section empty-state"><h1>Akses terbatas.</h1><p>Akun ini belum ditugaskan sebagai organizer.</p><Link className="button" href="/account">Kembali ke akun</Link></main>;try{const data=await organizerSnapshot();return <main id="main" className="organizer-container"><OrganizerDashboard data={data}/></main>;}catch{return <main id="main" className="container section empty-state"><h1>Dashboard belum dapat dimuat.</h1><p>Coba muat ulang halaman.</p><Link className="button" href="/organizer">Coba lagi</Link></main>;}}
