import Link from 'next/link';
import { Ticket, Check, Sparkles, ArrowRight } from 'lucide-react';
import { rupiah } from './data';

type CategoryInfo = {
  id: string;
  name: string;
  price: number;
  quota: number;
  sections: string[];
};

export function TicketTiers({
  slug,
  basePrice,
  categories = []
}: {
  slug: string;
  basePrice: number;
  categories?: CategoryInfo[];
}) {
  // If specific categories aren't passed, show rich default tiers based on venue setup
  const displayTiers = categories.length > 0 ? categories : [
    {
      id: 'reguler',
      name: 'Reguler Pass',
      price: basePrice,
      quota: 36,
      sections: ['Section B'],
      perks: [
        'Akses masuk pintu utama SummaPass',
        'Tempat duduk bernomor di Section B',
        'Akses area food court & merchandise',
        'Reservasi aman 10 menit'
      ]
    },
    {
      id: 'vip',
      name: 'VIP Front Row',
      price: Math.round(basePrice * 1.5),
      quota: 12,
      sections: ['Section A'],
      perks: [
        'Akses jalur prioritas (Fast-Track Gate)',
        'Kursi terbaik Section A terdekat ke panggung',
        'Paket welcome kit & merchandise eksklusif',
        'Voucher minuman non-alkohol di Summarecon'
      ]
    }
  ];

  return (
    <section style={{ margin: '36px 0', border: '2px solid var(--ink)', borderRadius: 16, background: '#fff', padding: 26, boxShadow: '5px 5px 0 var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Ticket size={24} style={{ color: 'var(--purple)' }} />
        <h2 style={{ fontSize: 26, margin: 0, fontWeight: 800 }}>Pilihan Kategori Tiket</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px' }}>
        Pilih paket tiket yang sesuai dengan preferensi tempat duduk dan fasilitas Anda.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {displayTiers.map((tier: any) => {
          const isVip = tier.name.toLowerCase().includes('vip');
          const categoryQuery = isVip ? 'front' : (tier.id?.toLowerCase().includes('reg') ? 'regular' : (tier.id || 'regular'));
          const perks = tier.perks ?? [
            `Tempat duduk di ${tier.sections?.join(', ') || 'Venue'}`,
            'Akses e-ticket dengan QR terenkripsi',
            'Reservasi slot 10 menit dengan checkout instan'
          ];

          return (
            <div
              key={tier.id}
              style={{
                border: isVip ? '2.5px solid var(--purple)' : '1.5px solid var(--ink)',
                borderRadius: 14,
                background: isVip ? 'var(--purple-light)' : 'var(--cream)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                boxShadow: isVip ? '4px 5px 0 var(--purple)' : '3px 4px 0 var(--ink)'
              }}
            >
              {isVip && (
                <span style={{ position: 'absolute', top: -12, right: 18, background: 'var(--yellow)', border: '1.5px solid var(--ink)', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={12} /> Paling Diminati
                </span>
              )}

              <div>
                <h3 style={{ fontSize: 22, margin: '0 0 6px', fontWeight: 800 }}>
                  {tier.name}
                </h3>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
                  {tier.sections?.join(', ') ? `Penempatan: ${tier.sections.join(' & ')}` : 'Tempat duduk bernomor'}
                </span>

                <div style={{ margin: '14px 0 20px', paddingBottom: 16, borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Harga Tiket</span>
                  <strong style={{ fontSize: 26, fontWeight: 850, color: 'var(--purple)' }}>
                    {rupiah(tier.price)}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>/ orang</span>
                </div>

                <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
                  {perks.map((perk: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'start', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                      <Check size={16} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 1 }} />
                      <span>{perk}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Link
                  href={`/events/${slug}/seats?category=${categoryQuery}`}
                  className={`button ${isVip ? '' : 'button-dark'}`}
                  style={{ width: '100%', textDecoration: 'none' }}
                >
                  Pilih Kursi {tier.name.split(' ')[0]}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

