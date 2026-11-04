import Link from 'next/link';
import { requireSession,canAccessRole } from '@/lib/auth/session';
import { staffEvents } from '@/features/check-in/service';
import { CheckInScanner } from '@/features/check-in/scanner';
export const metadata={title:'Check-in petugas',robots:{index:false,follow:false}};
export default async function Staff(){const user=await requireSession('/staff');if(!await canAccessRole(user,'STAFF'))return <main id="main" className="container section empty-state"><h1>Akses terbatas.</h1><p>Akun ini belum ditugaskan sebagai petugas.</p><Link className="button" href="/account">Kembali ke akun</Link></main>;try{return <CheckInScanner events={await staffEvents()}/>;}catch{return <main id="main" className="container section empty-state"><h1>Check-in belum dapat dimuat.</h1><p>Coba muat ulang halaman.</p><Link className="button" href="/staff">Coba lagi</Link></main>;}}
