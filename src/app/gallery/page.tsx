import { publicCatalog } from '@/features/catalog/service';
import { EventGalleryCarousel } from '@/features/events/gallery-carousel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gallery event' };

export default async function GalleryPage() {
  const upcomingEvents = [...await publicCatalog()].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main className="container section gallery-page" id="main">
      <div className="page-heading gallery-page-heading">
        <div>
          <span className="eyebrow">UPCOMING EVENT</span>
          <h1>Coming Soon</h1>
          <p>Catat tanggalnya sebelum kehabisan!</p>
        </div>
      </div>
      <EventGalleryCarousel events={upcomingEvents} />
    </main>
  );
}
