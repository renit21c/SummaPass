import Link from 'next/link';
import { ArrowUpRight, Ticket, ShieldCheck, Phone } from 'lucide-react';
import { requireSession, canAccessRole } from '@/lib/auth/session';
import { publicCatalog } from '@/features/catalog/service';
import { ProfileEditor } from '@/features/account/profile-editor';
import { FavoritesSection } from '@/features/account/favorites-section';
export const metadata = { title: 'Akun saya' };
export default async function Account() {
 const user = await requireSession();
 const [organizer, staff, catalog] = await Promise.all([
   canAccessRole(user, 'ORGANIZER'),
   canAccessRole(user, 'STAFF'),
   publicCatalog().catch(() => [])
 ]);
 return (
   <main id="main" className="container section">
     <div className="account-heading">
       <div>
         <h1>Halo, {user.name}.</h1>
         <p>{user.email}</p>
       </div>
       <form action="/api/auth/logout" method="post">
         <button className="button button-light">Keluar</button>
       </form>
     </div>

     <div className="account-grid">
       <section className="account-card">
         <ShieldCheck size={30}/>
         <h2>Akun</h2>
         <p>{user.email}</p>
         {user.phone && (
           <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', fontSize: 13, color: 'var(--muted)' }}>
             <Phone size={14} /> {user.phone}
           </p>
         )}
         <span className="account-mode">{user.mode === 'demo' ? (staff?'Petugas demo':organizer?'Organizer demo':'Pengunjung demo') : 'Akun terdaftar'}</span>
         <p>{user.mode === 'demo' ? 'Akses sesuai peran demo yang dipilih.' : 'Akses sesuai penugasan event.'}</p>
       </section>

       <section className="account-card account-ticket">
         <Ticket size={32}/>
         <h2>Reservasi dan tiket</h2>
         <Link href="/events" className="button">Daftar event<ArrowUpRight size={18}/></Link>
         <Link href="/bookings" className="text-link account-bookings">Reservasi saya</Link>
         <Link href="/my-tickets" className="text-link account-bookings">Tiket saya</Link>
         <Link href="/notifications" className="text-link account-bookings">Notifikasi saya</Link>
       </section>

       <ProfileEditor initialUser={user} />
       <FavoritesSection catalog={catalog} />
     </div>

     {user.mode==='demo'&&!organizer&&<section className="access-links"><h2>Organizer demo</h2><form action="/api/auth/login" method="post"><input type="hidden" name="demoRole" value="organizer"/><input type="hidden" name="next" value="/organizer"/><button className="button">Buka organizer demo</button></form></section>}
     {user.mode==='demo'&&!staff&&<section className="access-links"><h2>Petugas demo</h2><form action="/api/auth/login" method="post"><input type="hidden" name="demoRole" value="staff"/><button className="button">Buka check-in demo</button></form></section>}
     {(organizer || staff) && <section className="access-links"><h2>Akses pengelola</h2>{organizer && <Link className="button" href="/organizer">Organizer</Link>}{staff && <Link className="button" href="/staff">Check-in petugas</Link>}</section>}
   </main>
 );
}
