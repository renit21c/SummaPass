'use client';
import { useState, useEffect } from 'react';
import { Images, X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

type GalleryPhoto = {
  id: string;
  title: string;
  caption: string;
  category: string;
  color: string;
  symbol: string;
};

const DEFAULT_PHOTOS: GalleryPhoto[] = [
  {
    id: 'p1',
    title: 'Suasana Panggung Akustik',
    caption: 'Tata cahaya temaram dan panggung intim di Sawarga Courtyard saat matahari terbenam.',
    category: 'Musik',
    color: 'var(--hot-pink)',
    symbol: '🎸'
  },
  {
    id: 'p2',
    title: 'Workshop Keramik Pemula',
    caption: 'Peserta mencoba membuat cangkir tanah liat dengan bimbingan artisan lokal berpengalaman.',
    category: 'Workshop',
    color: 'var(--mint)',
    symbol: '🏺'
  },
  {
    id: 'p3',
    title: 'Aktivitas Keluarga & Anak',
    caption: 'Panggung interaktif boneka dan permainan edukatif di Atrium Utama untuk akhir pekan.',
    category: 'Keluarga',
    color: 'var(--yellow)',
    symbol: '🎨'
  },
  {
    id: 'p4',
    title: 'After Hours Lighting Showcase',
    caption: 'Pertunjukan malam dengan tata suara surround dan pencahayaan panggung berstandar festival.',
    category: 'Musik',
    color: 'var(--purple-light)',
    symbol: '✨'
  }
];

export function EventGallery({ eventTitle }: { eventTitle: string }) {
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (selectedPhoto === null) return;
      if (e.key === 'Escape') setSelectedPhoto(null);
      if (e.key === 'ArrowRight') setSelectedPhoto((selectedPhoto + 1) % DEFAULT_PHOTOS.length);
      if (e.key === 'ArrowLeft') setSelectedPhoto((selectedPhoto - 1 + DEFAULT_PHOTOS.length) % DEFAULT_PHOTOS.length);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPhoto]);

  return (
    <section style={{ margin: '36px 0', border: '2px solid var(--ink)', borderRadius: 16, background: 'var(--cream)', padding: 26, boxShadow: '5px 5px 0 var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Images size={24} style={{ color: 'var(--purple)' }} />
        <h2 style={{ fontSize: 26, margin: 0, fontWeight: 800 }}>Galeri Acara & Suasana Venue</h2>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>
        Dokumentasi visual pengalaman dan atmosfer acara di Summarecon Mall Bandung.
      </p>

      {/* Photo Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {DEFAULT_PHOTOS.map((photo, index) => (
          <div
            key={photo.id}
            onClick={() => setSelectedPhoto(index)}
            style={{
              border: '1.5px solid var(--ink)',
              borderRadius: 12,
              background: photo.color,
              padding: 16,
              cursor: 'pointer',
              boxShadow: '3px 3px 0 var(--ink)',
              transition: 'transform 0.2s',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: 180,
              position: 'relative'
            }}
            tabIndex={0}
            role="button"
            aria-label={`Buka foto: ${photo.title}`}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedPhoto(index);
              }
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <span style={{ fontSize: 28 }}>{photo.symbol}</span>
              <span style={{ fontSize: 10, fontWeight: 700, background: '#fff', border: '1px solid var(--ink)', padding: '2px 8px', borderRadius: 12 }}>
                {photo.category}
              </span>
            </div>

            <div>
              <strong style={{ display: 'block', fontSize: 15, margin: '14px 0 4px', fontWeight: 800 }}>
                {photo.title}
              </strong>
              <p style={{ fontSize: 11, margin: 0, color: 'var(--ink)', lineHeight: 1.5 }}>
                {photo.caption}
              </p>
            </div>

            <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: 4, display: 'grid', placeItems: 'center' }}>
              <Maximize2 size={13} />
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedPhoto !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={DEFAULT_PHOTOS[selectedPhoto].title}
          onClick={() => setSelectedPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--cream)',
              border: '2px solid var(--ink)',
              borderRadius: 16,
              maxWidth: 620,
              width: '100%',
              padding: 28,
              boxShadow: '8px 8px 0 var(--yellow)',
              position: 'relative'
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              aria-label="Tutup galeri"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                background: '#fff',
                border: '1.5px solid var(--ink)',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>

            <div
              style={{
                background: DEFAULT_PHOTOS[selectedPhoto].color,
                borderRadius: 12,
                border: '1.5px solid var(--ink)',
                height: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                margin: '12px 0 20px',
                position: 'relative'
              }}
            >
              <span style={{ fontSize: 72 }}>{DEFAULT_PHOTOS[selectedPhoto].symbol}</span>
              <span style={{ fontSize: 13, fontWeight: 800, marginTop: 12, background: '#fff', border: '1px solid var(--ink)', padding: '4px 12px', borderRadius: 20 }}>
                {DEFAULT_PHOTOS[selectedPhoto].category} • SummaPass Stage
              </span>
            </div>

            <h3 style={{ fontSize: 22, margin: '0 0 8px', fontWeight: 800 }}>
              {DEFAULT_PHOTOS[selectedPhoto].title}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              {DEFAULT_PHOTOS[selectedPhoto].caption}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => setSelectedPhoto((selectedPhoto - 1 + DEFAULT_PHOTOS.length) % DEFAULT_PHOTOS.length)}
                className="button button-small button-light"
                aria-label="Foto sebelumnya"
              >
                <ChevronLeft size={16} /> Sebelumnya
              </button>

              <span style={{ fontSize: 12, fontWeight: 700 }}>
                {selectedPhoto + 1} / {DEFAULT_PHOTOS.length}
              </span>

              <button
                type="button"
                onClick={() => setSelectedPhoto((selectedPhoto + 1) % DEFAULT_PHOTOS.length)}
                className="button button-small button-light"
                aria-label="Foto selanjutnya"
              >
                Selanjutnya <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

