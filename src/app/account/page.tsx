import Link from 'next/link';
import { ArrowUpRight, Ticket, Bell, ClipboardList, LayoutDashboard, ScanLine, LogOut } from 'lucide-react';
import { requireSession, canAccessRole } from '@/lib/auth/session';
import { publicCatalog } from '@/features/catalog/service';
import { ProfileEditor } from '@/features/account/profile-editor';
import { FavoritesSection } from '@/features/account/favorites-section';
import '@/features/account/account.css';
export const metadata = { title: 'Akun saya' };
export default async function Account() {
 const user = await requireSession();
 const [organizer,staff,catalog] = await Promise.all([canAccessRole(user,'ORGANIZER'),canAccessRole(user,'STAFF'),publicCatalog().catch(()=>[])]);
 const initials=user.name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'S';
 return <main id="main" className="container section account-page">
  <div className="profile-page-heading"><div><h1>Akun saya</h1><p>Profil, tiket, dan event yang kamu simpan.</p></div><Link href="/events" className="text-link">Cari event<ArrowUpRight size={18}/></Link></div>
  <div className="profile-layout">
   <aside className="profile-sidebar" aria-label="Ringkasan akun">
    <section className="profile-identity"><div className="profile-avatar" aria-hidden="true">{initials}</div><h2>{user.name}</h2><p>{user.email}</p>{user.mode==='demo'&&<small>Akun demo</small>}</section>
    <nav className="profile-shortcuts" aria-label="Aktivitas saya">
     <Link href="/my-tickets"><Ticket size={20}/><span>Tiket saya</span><ArrowUpRight size={16}/></Link>
     <Link href="/bookings"><ClipboardList size={20}/><span>Pesanan saya</span><ArrowUpRight size={16}/></Link>
     <Link href="/notifications"><Bell size={20}/><span>Notifikasi</span><ArrowUpRight size={16}/></Link>
     {(organizer||staff)&&<div className="profile-workspace-links">{organizer&&<Link href="/organizer"><LayoutDashboard size={20}/><span>Organizer</span><ArrowUpRight size={16}/></Link>}{staff&&<Link href="/staff"><ScanLine size={20}/><span>Check-in petugas</span><ArrowUpRight size={16}/></Link>}</div>}
    </nav>
    <form action="/api/auth/logout" method="post" className="profile-logout"><button data-icon-action="" aria-label="Keluar dari akun" title="Keluar dari akun" type="submit"><LogOut size={20} aria-hidden="true" /></button></form>
   </aside>
   <div className="profile-main"><ProfileEditor initialUser={user}/></div>
  </div>
  <FavoritesSection catalog={catalog}/>
  {user.mode==='demo'&&(!organizer||!staff)&&<section className="profile-demo-access"><h2>Coba peran lain</h2><div>{!organizer&&<form action="/api/auth/login" method="post"><input type="hidden" name="demoRole" value="organizer"/><button className="button button-light">Organizer demo</button></form>}{!staff&&<form action="/api/auth/login" method="post"><input type="hidden" name="demoRole" value="staff"/><button className="button button-light">Petugas demo</button></form>}</div></section>}
 </main>;
}
