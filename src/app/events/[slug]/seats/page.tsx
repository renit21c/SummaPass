import { publicEvent } from '@/features/catalog/service';
export const dynamic='force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { events } from '@/features/events/data';
import { requireSession } from '@/lib/auth/session';
import { inventory } from '@/features/booking/service';
import { SeatPicker } from '@/features/booking/seat-picker';
import { QuantityPicker } from '@/features/booking/quantity-picker';
export const metadata={title:'Pesan tiket'};
export default async function SeatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ category?: string }>;
}) {
  const { slug } = await params;
  const { category } = (await searchParams) ?? {};
  const event = await publicEvent(slug);
  if (!event) notFound();
  const session = await requireSession(`/events/${slug}/seats${category ? `?category=${encodeURIComponent(category)}` : ''}`);
  let data;
  try {
    data = await inventory(slug);
  } catch {
    return (
      <main id="main" className="container section empty-state">
        <h1>Pilihan tiket belum tersedia.</h1>
        <p>Coba muat ulang pilihan tiket.</p>
        <Link className="button" href={`/events/${slug}/seats`}>Coba lagi</Link>
      </main>
    );
  }
  const realtime = data.mode === 'supabase' ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } : undefined;
  return (
    <main id="main" className="container section">
      <Link className="text-link back" href={`/events/${slug}`}>Kembali ke detail event</Link>
      {event.seatingMode==='GENERAL_ADMISSION'?<QuantityPicker initial={data} title={event.title} user={{name:session.name}} initialCategory={category}/>:<SeatPicker
        initial={data}
        title={event.title}
        realtime={realtime}
        user={{ name: session.name, email: session.email, phone: session.phone }}
        initialCategory={category}
      />}
    </main>
  );
}
