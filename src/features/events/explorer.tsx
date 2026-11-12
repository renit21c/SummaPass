'use client';
import { FieldLabel } from '@/components/form-fields';
import { ScrollReveal } from '@/components/scroll-reveal';
import { DiscountPrice } from '../promos/price';
import { useState, useMemo, useId } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Search, Heart, Filter, X, RotateCcw } from 'lucide-react';
import { type Event, dateLabel, rupiah } from './data';
import { Poster } from '@/components/poster';
import { useFavorites } from './favorites';
import { CategoryIcon, CategoryLabel, TrendingBadge } from './event-labels';

export function Explorer({ items, animate = false }: { items: Event[]; animate?: boolean }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Semua');
  const [sort, setSort] = useState<'date' | 'price' | 'price-desc'>('date');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [priceTier, setPriceTier] = useState<'all' | 'under100' | '100to150' | 'above150'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const filterPanelId = useId();

  const { favorites, toggle } = useFavorites();

  const filtered = useMemo(() => {
    return items.filter(e => {
      // Search query
      const matchesQuery = `${e.title} ${e.category} ${e.description ?? ''}`.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;

      // Category
      if (category !== 'Semua' && e.category !== category) return false;

      // Favorites
      if (onlyFavorites && !favorites.includes(e.slug)) return false;

      // Price preset
      if (priceTier === 'under100' && e.price >= 100000) return false;
      if (priceTier === '100to150' && (e.price < 100000 || e.price > 150000)) return false;
      if (priceTier === 'above150' && e.price <= 150000) return false;

      // Date range filter
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;

      return true;
    }).sort((a, b) => {
      if (sort === 'price') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return a.date.localeCompare(b.date);
    });
  }, [items, query, category, onlyFavorites, favorites, priceTier, startDate, endDate, sort]);

  const hasActiveFilters = category !== 'Semua' || onlyFavorites || priceTier !== 'all' || startDate !== '' || endDate !== '' || query !== '' || sort !== 'date';

  function resetFilters() {
    setQuery('');
    setCategory('Semua');
    setOnlyFavorites(false);
    setPriceTier('all');
    setStartDate('');
    setEndDate('');
    setSort('date');
  }

  return (
    <>
      <ScrollReveal enabled={animate} className="explorer-controls">
        <FieldLabel className="search-field">
          <Search size={20} />
          <span className="sr-only">Cari nama atau kategori event</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari event, musisi, atau workshop..."
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 0, padding: 4, cursor: 'pointer', color: 'var(--muted)' }}
              aria-label="Hapus kata kunci pencarian"
            >
              <X size={16} />
            </button>
          )}
        </FieldLabel>

        <button
          type="button"
          onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
          className={`chip ${showAdvancedFilter || startDate || endDate || priceTier !== 'all' || sort !== 'date' ? 'active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, height: 52 }}
          aria-expanded={showAdvancedFilter}
          aria-controls={filterPanelId}
        >
          <Filter size={16} />
          Filter Tanggal & Harga
        </button>
      </ScrollReveal>

      {showAdvancedFilter && (
        <div id={filterPanelId} className="explorer-filter-panel" role="region" aria-label="Filter tanggal dan harga" style={{ background: 'var(--cream)', border: '1.5px solid var(--ink)', borderRadius: 12, padding: 20, margin: '16px 0', boxShadow: '3px 3px 0 var(--ink)' }}>
          <FieldLabel className="explorer-filter-sort">
            <span>Urutkan event</span>
            <select value={sort} onChange={e => setSort(e.target.value as 'date' | 'price' | 'price-desc')}>
              <option value="date">Tanggal terdekat</option>
              <option value="price">Harga terendah</option>
              <option value="price-desc">Harga tertinggi</option>
            </select>
          </FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 20 }}>
            <div>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Filter Rentang Harga</span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`chip ${priceTier === 'all' ? 'active' : ''}`}
                  onClick={() => setPriceTier('all')}
                  style={{ minHeight: 44, padding: '8px 14px', fontSize: 12 }}
                >
                  Semua Harga
                </button>
                <button
                  type="button"
                  className={`chip ${priceTier === 'under100' ? 'active' : ''}`}
                  onClick={() => setPriceTier('under100')}
                  style={{ minHeight: 44, padding: '8px 14px', fontSize: 12 }}
                >
                  &lt; Rp100.000
                </button>
                <button
                  type="button"
                  className={`chip ${priceTier === '100to150' ? 'active' : ''}`}
                  onClick={() => setPriceTier('100to150')}
                  style={{ minHeight: 44, padding: '8px 14px', fontSize: 12 }}
                >
                  Rp100rb - Rp150rb
                </button>
                <button
                  type="button"
                  className={`chip ${priceTier === 'above150' ? 'active' : ''}`}
                  onClick={() => setPriceTier('above150')}
                  style={{ minHeight: 44, padding: '8px 14px', fontSize: 12 }}
                >
                  &gt; Rp150.000
                </button>
              </div>
            </div>

            <div>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Filter Rentang Tanggal</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <FieldLabel style={{ display: 'grid', gap: 4, fontSize: 11 }}>
                  <span>Dari Tanggal</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ border: '1px solid var(--ink)', borderRadius: 6, padding: '6px 10px', fontSize: 12, background: '#fff' }}
                  />
                </FieldLabel>
                <FieldLabel style={{ display: 'grid', gap: 4, fontSize: 11 }}>
                  <span>Sampai Tanggal</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ border: '1px solid var(--ink)', borderRadius: 6, padding: '6px 10px', fontSize: 12, background: '#fff' }}
                  />
                </FieldLabel>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              type="button"
              className="text-link"
              onClick={resetFilters}
              style={{ fontSize: 12, border: 0, background: 'none', cursor: 'pointer' }}
            >
              <RotateCcw size={14} /> Reset Semua Filter
            </button>
          </div>
        </div>
      )}

      <ScrollReveal enabled={animate} className="filter-row" label="Kategori event">
        {['Semua', 'Musik', 'Workshop', 'Keluarga'].map(c => (
          <button
            className={`chip ${category === c && !onlyFavorites ? 'active' : ''}`}
            key={c}
            aria-pressed={category === c && !onlyFavorites}
            onClick={() => {
              setCategory(c);
              setOnlyFavorites(false);
            }}
          >
            <CategoryIcon category={c}/>{c}
          </button>
        ))}

        <button
          className={`chip ${onlyFavorites ? 'active' : ''}`}
          aria-pressed={onlyFavorites}
          onClick={() => setOnlyFavorites(!onlyFavorites)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Heart size={14} fill={onlyFavorites ? 'currentColor' : 'none'} />
          Favorit Saya ({favorites.length})
        </button>

        <span className="result-count" aria-live="polite">
          {filtered.length} event ditemukan
        </span>
      </ScrollReveal>

      <div className="event-grid">
        {filtered.map((e, index) => {
          const isFav = favorites.includes(e.slug);
          return (
            <ScrollReveal className="event-card" key={e.slug} enabled={animate} delay={(index%4)*70} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={ev => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  toggle(e.slug);
                }}
                aria-label={isFav ? `Hapus ${e.title} dari favorit` : `Tambahkan ${e.title} ke favorit`}
                aria-pressed={isFav}
                style={{
                  position: 'absolute',
                  top: 18,
                  right: 18,
                  zIndex: 10,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: isFav ? 'var(--pink)' : '#fff',
                  border: '1.5px solid var(--ink)',
                  boxShadow: '2px 2px 0 var(--ink)',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: isFav ? 'var(--ink)' : 'var(--muted)'
                }}
              >
                <Heart size={18} fill={isFav ? 'currentColor' : 'none'} />
              </button>

              <Link href={`/events/${e.slug}`} style={{ display: 'block', height: '100%' }}>
                <div className="event-cover"><Poster event={e} />{e.isTrending&&<TrendingBadge/>}</div>
                <div className="card-meta">
                  <CategoryLabel category={e.category}/>
                  <span>
                    <CalendarDays size={13} />
                    {dateLabel(e.date)}
                  </span>
                </div>
                <div className="card-title">
                  <h3>{e.title}</h3>
                  <ArrowUpRight size={21} />
                </div>
                <p className="card-venue">Summarecon Mall Bandung</p>
                <div className="card-price">
                  <span>Mulai dari</span>
                  <DiscountPrice price={e.price} originalPrice={e.originalPrice}/>
                </div>
              </Link>
            </ScrollReveal>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>Event tidak ditemukan</h3>
          <p>Coba kata kunci lain atau ubah pengaturan filter tanggal dan harga.</p>
          <button className="button" onClick={resetFilters}>
            Reset Semua Filter
          </button>
        </div>
      )}
    </>
  );
}
