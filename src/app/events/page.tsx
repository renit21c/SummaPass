import { publicCatalog } from '@/features/catalog/service';
export const dynamic='force-dynamic';
import { Explorer } from '@/features/events/explorer';
export const metadata = { title: 'Daftar event' };
export default async function EventsPage(){return <main className="container section" id="main"><div className="page-heading"><h1>Daftar event</h1></div><Explorer items={await publicCatalog()}/></main>}
