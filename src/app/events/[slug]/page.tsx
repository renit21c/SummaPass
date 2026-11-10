import { inventory } from '@/features/booking/service';
import { publicEvent } from '@/features/catalog/service';
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, MapPin, Clock3 } from 'lucide-react';
import { events, dateLabel, rupiah } from '@/features/events/data';
import { Poster } from '@/components/poster';
import { FavoriteButton } from '@/features/events/favorite-button';
import { CategoryLabel, TrendingBadge } from '@/features/events/event-labels';
import { TicketTiers } from '@/features/events/ticket-tiers';
import { VenueMap } from '@/features/events/venue-map';
import { EventGallery } from '@/features/events/gallery';

export default async function EventDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await publicEvent(slug);
  if (!event) notFound();
  const withoutSeats=event.seatingMode==='GENERAL_ADMISSION';
  const admissionInventory=withoutSeats?await inventory(slug):undefined;

  return (
    <main id="main" className="container section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
        <Link className="text-link back" style={{ margin: 0 }} href="/events">
          <ArrowLeft size={17} />Kembali ke event
        </Link>
        <FavoriteButton slug={event.slug} title={event.title} />
      </div>

      <div className="detail-grid">
        <div className="detail-poster-column">
          <Poster event={event} large />
        </div>

        <div className="detail-copy">
          <h1>{event.title}</h1>
          <div className="event-detail-labels"><span className="category-badge"><CategoryLabel category={event.category}/></span>{event.isTrending&&<TrendingBadge/>}</div>
          <div className="detail-facts">
            <p><CalendarDays size={19} />{dateLabel(event.date)}</p>
            <p><Clock3 size={19} />{event.time}</p>
            <p><MapPin size={19} />{event.area ?? 'Summarecon Mall Bandung'}</p>
          </div>

          <h2>Tentang acara</h2>
          <p>{event.description}</p>

          <h2>Penyelenggara</h2>
          <p>{event.organizer ?? 'SummaPass & Partner Bandung'}</p>

          <h2>Ketentuan</h2>
          <p style={{ whiteSpace: 'pre-line' }}>{event.rules ?? '• Tiket berlaku untuk 1 orang per kursi terpilih.\n• Tunjukkan QR e-ticket pada petugas di pintu masuk.\n• Dilarang membawa makanan/minuman dari luar venue.'}</p>

          <div className="booking-preview">
            <span>Harga demo mulai dari</span>
            <strong>{rupiah(event.price)}</strong>
            <p>Reservasi berlaku 10 menit. Bayar lewat simulasi.</p>
            <Link className="button" href={`/events/${event.slug}/${withoutSeats?'tickets':'seats'}`}>{withoutSeats?'Pesan tiket':'Pilih kursi'}</Link>
          </div>
        </div>
      </div>

      {/* Ticket Tiers Details */}
      <TicketTiers slug={event.slug} basePrice={event.price} withoutSeats={withoutSeats} categories={admissionInventory?.categories} />

      {/* Interactive Venue Map & Floorplan */}
      <VenueMap area={event.area} withoutSeats={withoutSeats} />

      {/* Event Photo Gallery & Lightbox */}
      <EventGallery eventTitle={event.title} />
    </main>
  );
}
