'use client';
import { useState } from 'react';
import { MapPin, Navigation, Compass, Car, Train, ExternalLink, Info } from 'lucide-react';

export function VenueMap({ area = 'Summarecon Mall Bandung' }: { area?: string }) {
  const [activeZone, setActiveZone] = useState<'ballroom' | 'atrium' | 'courtyard'>('ballroom');

  const zones = {
    ballroom: {
      name: 'Grand Ballroom (Lantai 2)',
      desc: 'Area panggung tertutup ber-AC penuh dengan kapasitas tempat duduk nomor. Dilengkapi sound system konser dan tata lampu panggung profesional.',
      features: ['Kursi bernomor Baris A-C', 'Akses eskalator & lift', 'Ruang tunggu VIP & Toilet khusus']
    },
    atrium: {
      name: 'Atrium Utama (Lantai Dasar)',
      desc: 'Area panggung utama yang terletak di tengah mall dengan akses langsung dari Lobi Barat & Lobi Timur.',
      features: ['Gate registrasi & e-ticket scan', 'Dekat musholla & food court', 'Akses mudah ramah difabel']
    },
    courtyard: {
      name: 'Sawarga Courtyard (Semi-Outdoor)',
      desc: 'Amphitheater semi-terbuka dengan suasana taman dan angin sejuk Bandung, ideal untuk konser akustik dan workshop santai.',
      features: ['Panggung taman terbuka', 'Area duduk bertingkat', 'Dekat area parkir outdoor']
    }
  };

  return (
    <section style={{ margin: '36px 0', border: '2px solid var(--ink)', borderRadius: 16, background: 'var(--cream)', padding: 26, boxShadow: '5px 5px 0 var(--ink)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--purple)', background: 'var(--purple-light)', padding: '4px 10px', borderRadius: 20 }}>
            <Compass size={14} /> Peta Venue & Lokasi
          </span>
          <h2 style={{ fontSize: 28, margin: '8px 0 4px', fontWeight: 800 }}>Summarecon Mall Bandung</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            Jl. Bulevar Barat No. 1, Rancabolang, Gedebage, Kota Bandung, Jawa Barat
          </p>
        </div>

        <a
          href="https://maps.google.com/?q=Summarecon+Mall+Bandung"
          target="_blank"
          rel="noopener noreferrer"
          className="button button-small"
          style={{ textDecoration: 'none' }}
        >
          <Navigation size={16} />
          Buka Google Maps
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Visual Venue Floor Plan Diagram */}
      <div style={{ background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 12, padding: 18, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['ballroom', 'atrium', 'courtyard'] as const).map(z => (
            <button
              key={z}
              type="button"
              className={`chip ${activeZone === z ? 'active' : ''}`}
              onClick={() => setActiveZone(z)}
              style={{ minHeight: 36, padding: '6px 14px', fontSize: 12 }}
            >
              <MapPin size={13} /> {zones[z].name.split(' (')[0]}
            </button>
          ))}
        </div>

        {/* SVG schematic representation of Summarecon Mall Bandung venue layout */}
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <svg viewBox="0 0 700 240" style={{ width: '100%', minWidth: 500, height: 'auto', display: 'block' }} aria-label="Denah zona Summarecon Mall Bandung">
            {/* Mall Outline */}
            <rect x="10" y="10" width="680" height="220" rx="16" fill="#faf8f5" stroke="#24221f" strokeWidth="2" strokeDasharray="4 4" />
            
            {/* Lobi Barat & Timur */}
            <rect x="25" y="80" width="40" height="80" rx="6" fill="#eee4ff" stroke="#24221f" strokeWidth="1.5" />
            <text x="45" y="125" textAnchor="middle" transform="rotate(-90 45 125)" fontSize="11" fontWeight="700" fill="#253db8">LOBI BARAT</text>

            <rect x="635" y="80" width="40" height="80" rx="6" fill="#eee4ff" stroke="#24221f" strokeWidth="1.5" />
            <text x="655" y="125" textAnchor="middle" transform="rotate(90 655 125)" fontSize="11" fontWeight="700" fill="#253db8">LOBI TIMUR</text>

            {/* Atrium Utama */}
            <g onClick={() => setActiveZone('atrium')} style={{ cursor: 'pointer' }}>
              <rect
                x="85"
                y="30"
                width="160"
                height="180"
                rx="12"
                fill={activeZone === 'atrium' ? '#ffe044' : '#fff0d6'}
                stroke="#24221f"
                strokeWidth={activeZone === 'atrium' ? 3 : 1.5}
              />
              <text x="165" y="60" textAnchor="middle" fontSize="13" fontWeight="800" fill="#24221f">ATRIUM UTAMA</text>
              <text x="165" y="85" textAnchor="middle" fontSize="10" fill="#60564d">Lantai Dasar</text>
              <rect x="110" y="110" width="110" height="30" rx="4" fill="#6632cf" />
              <text x="165" y="130" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">GATE REGISTRASI</text>
              <text x="165" y="180" textAnchor="middle" fontSize="9" fill="#60564d">Drop-off & Pintu Utama</text>
            </g>

            {/* Grand Ballroom */}
            <g onClick={() => setActiveZone('ballroom')} style={{ cursor: 'pointer' }}>
              <rect
                x="265"
                y="30"
                width="200"
                height="180"
                rx="12"
                fill={activeZone === 'ballroom' ? '#ff7ac3' : '#eee4ff'}
                stroke="#24221f"
                strokeWidth={activeZone === 'ballroom' ? 3 : 1.5}
              />
              <text x="365" y="60" textAnchor="middle" fontSize="14" fontWeight="800" fill="#24221f">GRAND BALLROOM</text>
              <text x="365" y="80" textAnchor="middle" fontSize="10" fill="#60564d">Lantai 2 • Kursi Bernomor</text>
              {/* Stage block */}
              <rect x="290" y="95" width="150" height="35" rx="6" fill="#6632cf" />
              <text x="365" y="117" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">PANGGUNG UTAMA</text>
              {/* Seating indicators */}
              <text x="365" y="155" textAnchor="middle" fontSize="10" fontWeight="700" fill="#24221f">Section A • Section B</text>
              <text x="365" y="180" textAnchor="middle" fontSize="9" fill="#60564d">Akses: Lift/Eskalator Lt. 2</text>
            </g>

            {/* Sawarga Courtyard */}
            <g onClick={() => setActiveZone('courtyard')} style={{ cursor: 'pointer' }}>
              <rect
                x="485"
                y="30"
                width="135"
                height="180"
                rx="12"
                fill={activeZone === 'courtyard' ? '#51e3ab' : '#c9d1ae'}
                stroke="#24221f"
                strokeWidth={activeZone === 'courtyard' ? 3 : 1.5}
              />
              <text x="552" y="60" textAnchor="middle" fontSize="12" fontWeight="800" fill="#24221f">SAWARGA</text>
              <text x="552" y="78" textAnchor="middle" fontSize="10" fontWeight="800" fill="#24221f">COURTYARD</text>
              <text x="552" y="100" textAnchor="middle" fontSize="9" fill="#154336">Semi-Outdoor</text>
              <circle cx="552" cy="140" r="24" fill="#24221f" />
              <text x="552" y="144" textAnchor="middle" fontSize="9" fontWeight="700" fill="#51e3ab">STAGE</text>
              <text x="552" y="185" textAnchor="middle" fontSize="9" fill="#154336">Amphitheater</text>
            </g>
          </svg>
        </div>

        {/* Selected Zone Details */}
        <div style={{ marginTop: 16, padding: 14, background: 'var(--cream)', borderRadius: 8, border: '1px solid var(--line)' }}>
          <strong style={{ fontSize: 14, color: 'var(--purple)', display: 'block', marginBottom: 4 }}>
            {zones[activeZone].name}
          </strong>
          <p style={{ fontSize: 13, margin: '0 0 10px', color: 'var(--ink)' }}>
            {zones[activeZone].desc}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {zones[activeZone].features.map((f, i) => (
              <span key={i} style={{ fontSize: 11, background: '#fff', border: '1px solid var(--line)', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>
                ✓ {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Directions & Transportation info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
          <Train size={22} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 2 }}>Kereta Cepat Whoosh & Shuttle</strong>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--muted)' }}>
              Tersedia shuttle gratis Summarecon dari Stasiun Kereta Cepat Tegalluar setiap 30 menit langsung ke Lobi Timur mall.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
          <Car size={22} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ fontSize: 13, display: 'block', marginBottom: 2 }}>Akses Tol & Parkir Luas</strong>
            <p style={{ fontSize: 12, margin: 0, color: 'var(--muted)' }}>
              Akses cepat via Tol Padaleunyi Exit KM 149 Gedebage. Parkir basement P1-P2 berkapasitas 2.000 mobil dengan slot khusus difabel.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

