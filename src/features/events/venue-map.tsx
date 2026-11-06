'use client';
import { useState } from 'react';
import { MapPin, Navigation, Building2, Trees, Store, Check, ArrowUpRight } from 'lucide-react';

const zones = {
  ballroom:{name:'Grand Ballroom',level:'Lantai 2',icon:Building2,desc:'Area pertunjukan dalam ruangan.',features:['Kursi bernomor','Akses lift dan eskalator']},
  atrium:{name:'Atrium Utama',level:'Lantai dasar',icon:Store,desc:'Area acara di dalam mall.',features:['Area registrasi','Akses lobi utama']},
  courtyard:{name:'Sawarga Courtyard',level:'Semi-outdoor',icon:Trees,desc:'Area pertunjukan terbuka.',features:['Panggung terbuka','Area duduk bertingkat']}
};
type Zone=keyof typeof zones;
export function VenueMap({area='Summarecon Mall Bandung'}:{area?:string}) {
  const [activeZone,setActiveZone]=useState<Zone>('ballroom');
  const selected=zones[activeZone],ZoneIcon=selected.icon;
  const venue=area.trim()||'Summarecon Mall Bandung';
  const mapsUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
  return <section className="event-extra venue-section" aria-labelledby="venue-heading">
    <div className="event-extra-heading">
      <span className="event-extra-icon"><MapPin size={23} aria-hidden="true"/></span>
      <div><h2 id="venue-heading">Peta venue dan lokasi</h2><p>{venue}</p></div>
      <a className="button button-small venue-directions" href={mapsUrl} target="_blank" rel="noopener noreferrer"><Navigation size={17} aria-hidden="true"/>Buka Maps<ArrowUpRight size={17} aria-hidden="true"/><span className="sr-only"> (tab baru)</span></a>
    </div>
    {venue==='Summarecon Mall Bandung'?<>
      <div className="venue-zone-switch" role="group" aria-label="Pilih zona venue">
        {(Object.keys(zones) as Zone[]).map(key=>{const Icon=zones[key].icon;return <button type="button" key={key} aria-pressed={activeZone===key} aria-controls="venue-zone-detail" onClick={()=>setActiveZone(key)} className={activeZone===key?'is-active':''}><Icon size={18} aria-hidden="true"/>{zones[key].name}</button>;})}
      </div>
      <div className="venue-diagram-scroll" tabIndex={0} role="region" aria-label="Skema venue, geser untuk melihat seluruh denah">
          <svg viewBox="0 0 700 240" className="venue-diagram" role="img" aria-label="Ilustrasi zona atrium, ballroom, dan courtyard">
            {/* Mall Outline */}
            <rect x="10" y="10" width="680" height="220" rx="16" fill="var(--cream)" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 4" />
            
            {/* Lobi Barat & Timur */}
            <rect x="25" y="80" width="40" height="80" rx="6" fill="var(--purple-light)" stroke="var(--ink)" strokeWidth="1.5" />
            <text x="45" y="120" textAnchor="middle" dominantBaseline="central" transform="rotate(-90 45 120)" fontSize="11" fontWeight="700" fill="var(--purple)">LOBI BARAT</text>

            <rect x="635" y="80" width="40" height="80" rx="6" fill="var(--purple-light)" stroke="var(--ink)" strokeWidth="1.5" />
            <text x="655" y="120" textAnchor="middle" dominantBaseline="central" transform="rotate(90 655 120)" fontSize="11" fontWeight="700" fill="var(--purple)">LOBI TIMUR</text>

            {/* Atrium Utama */}
            <g>
              <rect
                x="85"
                y="30"
                width="160"
                height="180"
                rx="12"
                fill={activeZone === 'atrium' ? 'var(--yellow)' : 'var(--surface)'}
                stroke="var(--ink)"
                strokeWidth={activeZone === 'atrium' ? 3 : 1.5}
              />
              <text x="165" y="60" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--ink)">ATRIUM UTAMA</text>
              <text x="165" y="85" textAnchor="middle" fontSize="10" fill="var(--muted)">Lantai Dasar</text>
              <rect x="110" y="110" width="110" height="30" rx="4" fill="var(--purple)" />
              <text x="165" y="130" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">GATE REGISTRASI</text>
              <text x="165" y="180" textAnchor="middle" fontSize="9" fill="var(--muted)">Drop-off & Pintu Utama</text>
            </g>

            {/* Grand Ballroom */}
            <g>
              <rect
                x="265"
                y="30"
                width="200"
                height="180"
                rx="12"
                fill={activeZone === 'ballroom' ? 'var(--pink)' : 'var(--purple-light)'}
                stroke="var(--ink)"
                strokeWidth={activeZone === 'ballroom' ? 3 : 1.5}
              />
              <text x="365" y="60" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink)">GRAND BALLROOM</text>
              <text x="365" y="80" textAnchor="middle" fontSize="10" fill="var(--muted)">Lantai 2 • Kursi Bernomor</text>
              {/* Stage block */}
              <rect x="290" y="95" width="150" height="35" rx="6" fill="var(--purple)" />
              <text x="365" y="117" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">PANGGUNG UTAMA</text>
              {/* Seating indicators */}
              <text x="365" y="155" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">Section A • Section B</text>
              <text x="365" y="180" textAnchor="middle" fontSize="9" fill="var(--muted)">Akses: Lift/Eskalator Lt. 2</text>
            </g>

            {/* Sawarga Courtyard */}
            <g>
              <rect
                x="485"
                y="30"
                width="135"
                height="180"
                rx="12"
                fill={activeZone === 'courtyard' ? 'var(--mint)' : 'var(--surface)'}
                stroke="var(--ink)"
                strokeWidth={activeZone === 'courtyard' ? 3 : 1.5}
              />
              <text x="552" y="60" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--ink)">SAWARGA</text>
              <text x="552" y="78" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--ink)">COURTYARD</text>
              <text x="552" y="100" textAnchor="middle" fontSize="9" fill="var(--ink)">Semi-Outdoor</text>
              <circle cx="552" cy="140" r="24" fill="var(--ink)" />
              <text x="552" y="144" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--mint)">STAGE</text>
              <text x="552" y="185" textAnchor="middle" fontSize="9" fill="var(--ink)">Amphitheater</text>
            </g>
          </svg>
      </div>
      <div className="venue-zone-detail" id="venue-zone-detail" aria-live="polite">
        <span className="venue-zone-icon"><ZoneIcon size={25} aria-hidden="true"/></span>
        <div><h3>{selected.name}<span>{selected.level}</span></h3><p>{selected.desc}</p><ul>{selected.features.map(feature=><li key={feature}><Check size={15} aria-hidden="true"/>{feature}</li>)}</ul></div>
      </div>
      <p className="venue-map-note">Skema ilustrasi. Ikuti petunjuk lokasi dari panitia saat acara.</p>
    </>:<div className="venue-location-summary"><Building2 size={30} aria-hidden="true"/><div><h3>{venue}</h3><p>Lihat rute menuju lokasi melalui Google Maps.</p></div></div>}
  </section>;
}
