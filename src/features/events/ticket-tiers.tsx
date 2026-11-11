import Link from 'next/link';
import type {TicketPackage} from '@/features/ticket-options/core';
import '../ticket-options/options.css';
import { Ticket, Check, ArrowRight } from 'lucide-react';
import { rupiah } from './data';

type CategoryInfo = {
  id: string;
  name: string;
  price: number;
  quota: number;
  sections: string[];
  description?:string;packages?:TicketPackage[];perks?:string[];
};

export function TicketTiers({
  slug,
  basePrice,
  withoutSeats = false,
  categories = []
}: {
  slug: string;
  basePrice: number;
  withoutSeats?: boolean;
  categories?: CategoryInfo[];
}) {
  // If specific categories aren't passed, show rich default tiers based on venue setup
  const displayTiers:CategoryInfo[] = categories.length > 0 ? categories : [
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
        {withoutSeats?'Pilih jumlah tiket. Event ini tidak menggunakan nomor kursi.':'Pilih paket tiket yang sesuai dengan preferensi tempat duduk dan fasilitas Anda.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {displayTiers.map((tier) => {
          const isVip = tier.name.toLowerCase().includes('vip');
          const categoryQuery = categories.length>0?tier.id:isVip ? 'front' : (tier.id?.toLowerCase().includes('reg') ? 'regular' : (tier.id || 'regular'));
          const perks = withoutSeats?['Akses event tanpa nomor kursi','E-ticket dengan QR','Reservasi tiket selama 10 menit']:tier.perks ?? [
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


              <div>
                <h3 style={{ fontSize: 22, margin: '0 0 6px', fontWeight: 800 }}>
                  {tier.name}
                </h3>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
                  {withoutSeats?'Tanpa nomor kursi':tier.sections?.join(', ') ? `Penempatan: ${tier.sections.join(' & ')}` : 'Tempat duduk bernomor'}
                </span>

                <div style={{ margin: '14px 0 20px', paddingBottom: 16, borderBottom: '1px dashed var(--line)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Harga Tiket</span>
                  <strong className="customer-ticket-price">
                    {rupiah(tier.packages?.length?Math.min(...tier.packages.map(p=>p.price)):tier.price)}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{tier.packages?.length?'/ paket':'/ orang'}</span>
                </div>

                {tier.description&&<p style={{fontSize:13,lineHeight:1.6}}>{tier.description}</p>}
                {!!tier.packages?.length&&<ul className="tier-packages">{tier.packages.map(p=><li key={p.id}><span><strong>{p.name}</strong> · {p.participants} orang</span><strong>{rupiah(p.price)} / paket</strong></li>)}</ul>}
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
                  href={`/events/${slug}/${withoutSeats?'tickets':'seats'}?category=${encodeURIComponent(withoutSeats?tier.id:categoryQuery)}`}
                  className={`button ${isVip ? '' : 'button-dark'}`}
                  style={{ width: '100%', textDecoration: 'none' }}
                >
                  {withoutSeats?'Pesan tiket':`Pilih Kursi ${tier.name.split(' ')[0]}`}
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

