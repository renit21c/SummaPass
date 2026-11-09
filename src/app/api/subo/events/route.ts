import { publicCatalog } from '@/features/catalog/service';

export async function GET() {
  try {
    const events = (await publicCatalog())
      .filter(event => !event.cancelledAt && Date.parse(event.startsAt) > Date.now())
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 3)
      .map(({ slug, title, startsAt, area, price }) => ({ slug, title, startsAt, area, price }));
    return Response.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Event belum bisa dimuat. Coba lagi.' }, { status: 503 });
  }
}
