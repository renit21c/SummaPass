'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="container section empty-state"><h1>Halaman gagal dimuat.</h1><p>Periksa koneksi lalu coba lagi.</p><button className="button" onClick={reset}>Coba lagi</button></main>;
}
