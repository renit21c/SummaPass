'use client';

import { DiscountPrice } from '../promos/price';
import Link from 'next/link';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Gift, Mic2, Sparkles, Ticket, X } from 'lucide-react';
import { Poster } from '@/components/poster';
import { type Event, dateLabel, rupiah } from './data';
import { CategoryLabel, TrendingBadge } from './event-labels';

export function EventGalleryCarousel({ events }: { events: Event[] }) {
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedEvent = selected === null ? null : events[selected];

  useEffect(() => {
    if (selected === null) return;
    if (!dialog.current?.open) dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selected]);

  useEffect(() => {
    if (paused || selected !== null || events.length < 2) return;
    const interval = window.setInterval(() => setActive(current => (current + 1) % events.length), 4500);
    return () => window.clearInterval(interval);
  }, [events.length, paused, selected]);

  const moveCarousel = (step: number) => {
    if (!events.length) return;
    setActive(current => (current + step + events.length) % events.length);
  };

  const movePreview = (step: number) => {
    setSelected(current => current === null ? null : (current + step + events.length) % events.length);
  };

  const closePreview = () => {
    dialog.current?.close();
    setSelected(null);
  };

  if (!events.length) {
    return <div className="empty-state"><h3>Belum ada event</h3><p>Event yang akan datang akan tampil di sini.</p></div>;
  }

  return (
    <div className="event-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="event-carousel-stage">
        <button type="button" className="event-carousel-arrow previous" onClick={() => moveCarousel(-1)} aria-label="Poster sebelumnya">
          <ChevronLeft size={24} />
        </button>

        <div className="event-carousel-track">
          {events.map((event, index) => {
            const offset = (index - active + events.length) % events.length;
            const position = offset > Math.floor(events.length / 2) ? offset - events.length : offset;
            return (
              <button
                type="button"
                className={`event-carousel-slide ${position === 0 ? 'is-active' : ''}`}
                style={{
                  transform: `translate(-50%, -50%) translateX(${position * 230}px) scale(${1 - Math.min(Math.abs(position), 2) * 0.16})`,
                } as CSSProperties}
                onClick={() => position === 0 ? setSelected(index) : setActive(index)}
                key={event.slug}
                aria-label={position === 0 ? `Lihat preview ${event.title}` : `Tampilkan ${event.title}`}
              >
                <div className="event-carousel-poster event-cover"><Poster event={event} />{event.isTrending&&<TrendingBadge/>}</div>
                <span className="event-carousel-caption">
                  <strong>{event.title}</strong>
                  <small><CategoryLabel category={event.category}/></small>
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className="event-carousel-arrow next" onClick={() => moveCarousel(1)} aria-label="Poster berikutnya">
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="event-carousel-status">
        <span>{active + 1} / {events.length}</span>
        <div className="event-carousel-dots" aria-label="Pilih poster event">
          {events.map((event, index) => (
            <button
              type="button"
              className={active === index ? 'is-active' : ''}
              onClick={() => setActive(index)}
              key={event.slug}
              aria-label={`Tampilkan ${event.title}`}
              aria-current={active === index ? 'true' : undefined}
            />
          ))}
        </div>

        <section className="gallery-highlights" aria-label="Preview highlight event">
          <div className="gallery-highlights-heading">
            <span>Event highlights</span>
            <h2>Lebih dari sekadar panggung</h2>
          </div>
          <div className="gallery-highlight-grid">
            <article className="gallery-highlight-card gallery-highlight-featured">
              <div className="gallery-highlight-icon"><Mic2 size={28} /></div>
              <div><span>Guest star</span><strong>{events[active]?.title}</strong><p>Penampilan spesial yang dinanti.</p></div>
            </article>
            <article className="gallery-highlight-card gallery-highlight-gift">
              <div className="gallery-highlight-icon"><Gift size={28} /></div>
              <div><span>Doorprize</span><strong>Hadiah untuk pengunjung</strong><p>Ikuti rangkaian acara untuk kesempatan menang.</p></div>
            </article>
            <article className="gallery-highlight-card gallery-highlight-special">
              <div className="gallery-highlight-icon"><Sparkles size={28} /></div>
              <div><span>Special moment</span><strong>Pengalaman baru</strong><p>Aktivitas, suasana, dan momen yang berkesan.</p></div>
            </article>
          </div>
        </section>
      </div>

      <dialog
        ref={dialog}
        className="event-preview-dialog"
        onClose={() => setSelected(null)}
        onCancel={event => {
          event.preventDefault();
          closePreview();
        }}
        onClick={event => { if (event.target === event.currentTarget) closePreview(); }}
        aria-labelledby="event-preview-title"
      >
        {selectedEvent && (
          <div className="event-preview-box">
            <button type="button" className="event-preview-close" onClick={closePreview} aria-label="Tutup preview">
              <X size={21} />
            </button>
            <div className="event-preview-cover"><Poster event={selectedEvent} /></div>
            <div className="event-preview-copy">
              <div className="event-detail-labels"><span className="category-badge"><CategoryLabel category={selectedEvent.category}/></span>{selectedEvent.isTrending&&<TrendingBadge/>}</div>
              <h2 id="event-preview-title">{selectedEvent.title}</h2>
              <p>{selectedEvent.description}</p>
              <div className="event-preview-facts">
                <span><CalendarDays size={17} />{dateLabel(selectedEvent.date)}</span>
                <DiscountPrice price={selectedEvent.price} originalPrice={selectedEvent.originalPrice}/>
              </div>
              <Link className="button event-preview-book" href={`/events/${selectedEvent.slug}/${selectedEvent.seatingMode==='GENERAL_ADMISSION'?'tickets':'seats'}`}>
                <Ticket size={18} />Pesan tiket
              </Link>
            </div>
            <div className="event-preview-nav">
              <button type="button" className="icon-button" onClick={() => movePreview(-1)} aria-label="Event sebelumnya">
                <ChevronLeft size={21} />
              </button>
              <span aria-live="polite">{selected! + 1} / {events.length}</span>
              <button type="button" className="icon-button" onClick={() => movePreview(1)} aria-label="Event berikutnya">
                <ChevronRight size={21} />
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
