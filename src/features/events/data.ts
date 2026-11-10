export type EventCategory = 'Musik' | 'Workshop' | 'Keluarga';
export type Event = { seatingMode?:'SEATED'|'GENERAL_ADMISSION'; slug: string; title: string; category: EventCategory; date: string; time: string; price: number; theme: string; headline: string; description: string; coverUrl?:string; organizer?:string; area?:string; rules?:string };
export const events: Event[] = [
  { slug: 'senja-di-summa', title: 'Senja di Summa', category: 'Musik', date: '2026-12-12', time: '16.00 WIB', price: 125000, theme: 'sunset', headline: 'SENJA\nDI SUMMA', description: 'Pertunjukan musik akustik dari musisi demo Bandung.' },
  { slug: 'clay-and-coffee', title: 'Clay & Coffee Club', category: 'Workshop', date: '2026-12-13', time: '10.00 WIB', price: 175000, theme: 'clay', headline: 'a little clay.\na little coffee.', description: 'Pelan-pelan membuat sesuatu dengan tangan sendiri. Workshop keramik pemula dengan material dan satu minuman nonalkohol.' },
  { slug: 'little-weekend', title: 'Little Weekend', category: 'Keluarga', date: '2026-12-19', time: '09.00 WIB', price: 75000, theme: 'play', headline: 'little\nWEEKEND', description: 'Waktu bermain untuk si kecil dan keluarga. Pertunjukan interaktif dan kegiatan kreatif dalam satu pagi yang menyenangkan.' },
  { slug: 'after-hours', title: 'After Hours Sessions', category: 'Musik', date: '2026-12-20', time: '18.00 WIB', price: 150000, theme: 'night', headline: 'AFTER\nHOURS', description: 'Temukan suara baru dalam showcase musik independen fiktif. Pertunjukan intim dengan tempat duduk bernomor.' },
];
export const rupiah = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
export const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${value}T12:00:00+07:00`));
