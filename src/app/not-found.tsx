import Link from 'next/link';
export default function NotFound(){return <main id="main" className="container empty-state"><h1>Halaman tidak ditemukan</h1><p>Periksa alamat atau kembali ke daftar event.</p><Link className="button" href="/events">Daftar event</Link></main>}
