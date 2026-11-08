'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, RefreshCw, MapPin, User, Mail, Phone, Sparkles, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import { statusLabel, type Inventory } from './types';
import { ConcurrencySimulatorModal } from './concurrency-simulator-modal';

export function SeatPicker({
  initial,
  title,
  realtime,
  user,
  initialCategory,
}: {
  initial: Inventory;
  title: string;
  realtime?: { url: string; key: string };
  user?: { name: string; email: string; phone?: string };
  initialCategory?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);

  const resolveInitialCategoryId = () => {
    if (!initial.categories.length) return '';
    if (initialCategory) {
      const clean = initialCategory.toLowerCase().trim();
      const direct = initial.categories.find(c => c.id.toLowerCase() === clean);
      if (direct) return direct.id;

      if (clean.includes('vip') || clean.includes('front')) {
        const vipOrFront = initial.categories.find(c =>
          c.name.toLowerCase().includes('front') ||
          c.name.toLowerCase().includes('vip') ||
          c.id.toLowerCase().includes('front') ||
          c.id.toLowerCase().includes('vip')
        );
        if (vipOrFront) return vipOrFront.id;
      }

      if (clean.includes('reg') || clean.includes('regular') || clean.includes('reguler')) {
        const reg = initial.categories.find(c =>
          c.name.toLowerCase().includes('reg') ||
          c.id.toLowerCase().includes('reg')
        );
        if (reg) return reg.id;
      }

      const matchName = initial.categories.find(c => c.name.toLowerCase().includes(clean));
      if (matchName) return matchName.id;
    }
    return initial.categories[0]?.id ?? '';
  };

  const [categoryId, setCategoryId] = useState(resolveInitialCategoryId);
  const [selected, setSelected] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [identities, setIdentities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedSeat, setExpandedSeat] = useState<string | null>(null);

  // Booker contact
  const [bookerName, setBookerName] = useState(user?.name ?? '');
  const [bookerEmail, setBookerEmail] = useState(user?.email ?? '');
  const [bookerPhone, setBookerPhone] = useState(user?.phone ?? '');
  const [syncFirstTicket, setSyncFirstTicket] = useState(true);

  const [view, setView] = useState<'map' | 'list'>('map');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const pending = useRef(false);
  const requestKey = useRef('');

  const category = data.categories.find(c => c.id === categoryId);
  const chosen = data.seats.filter(s => selected.includes(s.id));
  useEffect(() => {
    const current=data.categories.find(c=>c.id===categoryId);
    if(!current){setCategoryId(data.categories[0]?.id??'');setSelected([]);return;}
    setSelected(previous=>previous.filter(id=>data.seats.some(s=>s.id===id&&s.status==='AVAILABLE'&&current.sections.includes(s.section))).slice(0,Math.min(6,current.remaining??current.quota)));
  },[data,categoryId]);

  // Sync first ticket name if user opted in
  useEffect(() => {
    if (syncFirstTicket && chosen.length > 0 && bookerName) {
      const firstId = chosen[0].id;
      if (!names[firstId]) {
        setNames(prev => ({ ...prev, [firstId]: bookerName }));
      }
    }
  }, [syncFirstTicket, chosen, bookerName, names]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${initial.slug}/seats`, { cache: 'no-store' });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error);
      setData(next);
      const available = new Set((next as Inventory).seats.filter(s => s.status === 'AVAILABLE').map(s => s.id));
      setSelected(previous => {
        const kept = previous.filter(id => available.has(id));
        if (kept.length !== previous.length) setMessage('Ada kursi pilihan yang baru ditahan pengunjung lain. Pilihan sudah diperbarui.');
        return kept;
      });
      setError('');
    } catch {
      setError('Ketersediaan belum bisa diperbarui. Periksa koneksi lalu coba lagi.');
    }
  }, [initial.slug]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!pending.current) void refresh();
    }, 5000);
    const onFocus = () => {
      if (!pending.current) void refresh();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!realtime) return;
    let cleanup = () => {};
    let stopped = false;
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      if (stopped) return;
      const client = createBrowserClient(realtime.url, realtime.key);
      const channel = client.channel(`seats-${initial.eventId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'event_seats', filter: `event_id=eq.${initial.eventId}` }, () => {
        if (!pending.current) void refresh();
      }).subscribe(status => {
        if (status === 'SUBSCRIBED' && !pending.current) void refresh();
      });
      cleanup = () => {
        void client.removeChannel(channel);
      };
    });
    return () => {
      stopped = true;
      cleanup();
    };
  }, [realtime, initial.eventId, refresh]);

  useEffect(() => {
    requestKey.current = crypto.randomUUID();
  }, [selected, names, categoryId, bookerName, bookerEmail]);

  function toggle(id: string) {
    if (busy) return;
    setMessage('');
    setSelected(previous => {
      if (previous.includes(id)) {
        return previous.filter(s => s !== id);
      }
      if (previous.length >= Math.min(6, category?.remaining ?? category?.quota ?? 0)) {
        setMessage('Batas kursi atau kuota kategori sudah tercapai.');
        return previous;
      }
      return [...previous, id];
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category || busy || !chosen.length) return;
    setBusy(true);
    pending.current = true;
    setError('');

    try {
      const payload = {
        slug: data.slug,
        categoryId,
        seats: chosen.map((s, idx) => ({
          seatId: s.id,
          name: names[s.id] || (idx === 0 && bookerName ? bookerName : `Peserta ${s.row}${s.number}`),
          email: emails[s.id] || (idx === 0 ? bookerEmail : undefined),
          identityNumber: identities[s.id] || undefined,
          notes: notes[s.id] || undefined
        })),
        booker: {
          name: bookerName || user?.name || 'Pemesan',
          email: bookerEmail || user?.email || '',
          phone: bookerPhone || user?.phone || ''
        },
        key: requestKey.current || crypto.randomUUID()
      };

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          router.push(`/login?next=${encodeURIComponent(`/events/${data.slug}/seats`)}`);
          return;
        }
        await refresh();
        throw new Error(result.error);
      }
      router.push(`/bookings/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reservasi belum berhasil. Silakan coba lagi.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  const sections = [...new Set(data.seats.map(s => s.section))];

  return (
    <>
      <div className="seat-page-heading">
        <div>
          <h1>Pilih kursi</h1>
          <p>{title} <span aria-hidden="true">•</span> Summarecon Mall Bandung</p>
        </div>
        <span className="seat-mode">{data.mode === 'demo' ? 'Kursi demo' : 'Ketersediaan kursi'}</span>
      </div>

      <div className="seat-layout">
        <section className="seat-workspace">
          <h2>Kategori tiket</h2>
          <div className="category-options">
            {data.categories.map(c => {
              const isActive = c.id === categoryId;
              const isVip = c.name.toLowerCase().includes('vip');
              const availableInCat = Math.min(c.remaining ?? c.quota, data.seats.filter(s => c.sections.includes(s.section) && s.status === 'AVAILABLE').length);

              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  className={`category-option ${isActive ? 'is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    setCategoryId(c.id);
                    setSelected([]);
                    setMessage('');
                  }}
                  style={{ position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{c.name}</strong>
                    {isVip && (
                      <span style={{ background: 'var(--purple)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                        VIP
                      </span>
                    )}
                  </div>
                  <span>{rupiah(c.price)} / orang</span>
                  <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <Sparkles size={12} />
                    <span>Area: {c.sections.join(', ')} • {availableInCat} kursi tersedia</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="map-toolbar">
            <h2>Denah kursi</h2>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="concurrency-trigger-btn"
                onClick={() => setShowSimulator(true)}
                title="Uji ketahanan race condition perebutan kursi serentak"
              >
                <Zap size={14} />
                <span>⚡ Simulasi War Tiket</span>
              </button>
              <div className="view-switch">
                <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')} aria-pressed={view === 'map'}>Peta</button>
                <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'}>Daftar</button>
              </div>
            </div>
          </div>

          <div className="seat-legend">
            {[['AVAILABLE', 'Tersedia'], ['SELECTED', 'Pilihanmu'], ['RESERVED', 'Ditahan'], ['SOLD', 'Terjual']].map(([status, label]) => (
              <span key={status}>
                <i className={`legend-dot ${status.toLowerCase()}`} />
                {label}
              </span>
            ))}
          </div>

          <p className="seat-hint">Pilih maksimal 6 kursi dalam satu kategori. Kursi baru ditahan setelah reservasi berhasil.</p>

          {view === 'map' ? (
            <div className="seat-map">
              <svg viewBox={`0 0 ${data.width ?? 520} ${data.height ?? 570}`} role="group" aria-label="Peta kursi venue, gunakan Tab dan Enter atau Spasi untuk memilih">
                <rect x={((data.width??520)-Math.min(350,(data.width??520)-40))/2} y="12" width={Math.min(350,(data.width??520)-40)} height="45" rx="8" className="stage" />
                <text x={(data.width??520)/2} y="41" textAnchor="middle" className="stage-label">PANGGUNG</text>
                {sections.map(section=>{
                  const seats=data.seats.filter(s=>s.section===section);
                  const left=Math.min(...seats.map(s=>s.x)),right=Math.max(...seats.map(s=>s.x))+32;
                  const x=(left+right)/2,y=Math.min(...seats.map(s=>s.y))-28,half=section.length*5+12;
                  const blocked=data.seats.some(s=>s.x-6<x+half&&s.x+38>x-half&&s.y-8<y+6&&s.y+36>y-18);
                  return blocked?null:<text key={section} x={x} y={y} textAnchor="middle" className="section-label">{section}</text>;
                })}
                {sections.flatMap(section => [...new Set(data.seats.filter(s=>s.section===section).map(s=>s.row))].map(row=>{
                  const seats=data.seats.filter(s=>s.section===section&&s.row===row);
                  const first=seats.reduce((a,b)=>a.x<b.x?a:b);
                  return <text key={`${section}:${row}`} x={first.x-16} y={first.y+18} textAnchor="end" className="row-label">{row}</text>;
                }))}
                {data.seats.map(s => {
                  const eligible = !!category?.sections.includes(s.section);
                  const isSelected = selected.includes(s.id);
                  const disabled = !eligible || s.status !== 'AVAILABLE' || busy;
                  return (
                    <g
                      key={s.id}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={`${s.section}, baris ${s.row}, kursi ${s.number}, ${!eligible ? 'kategori lain' : isSelected ? 'dipilih' : statusLabel[s.status]}`}
                      onClick={() => {
                        if (!disabled) toggle(s.id);
                      }}
                      onKeyDown={event => {
                        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          toggle(s.id);
                        }
                      }}
                      className={`seat-node ${!eligible ? 'ineligible' : isSelected ? 'selected' : s.status.toLowerCase()}`}
                    >
                      <rect x={s.x - 6} y={s.y - 8} width="44" height="44" rx="8" />
                      <text x={s.x + 16} y={s.y + 18} textAnchor="middle">
                        {isSelected ? '✓' : s.status === 'SOLD' ? '×' : s.status === 'RESERVED' ? '−' : s.number}
                      </text>
                      <title>{`${s.section} ${s.row}${s.number}`}</title>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="seat-list">
              {sections.filter(s => category?.sections.includes(s)).map(section => (
                <div key={section}>
                  <h3>{section}</h3>
                  {[...new Set(data.seats.filter(s=>s.section===section).map(s=>s.row))].map(row => (
                    <div className="seat-list-row" key={row}>
                      <span>Baris {row}</span>
                      <div>
                        {data.seats.filter(s => s.section === section && s.row === row).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            disabled={s.status !== 'AVAILABLE' || busy}
                            aria-pressed={selected.includes(s.id)}
                            className={`seat-list-button ${selected.includes(s.id) ? 'selected' : s.status.toLowerCase()}`}
                            aria-label={`${section} ${row}${s.number}, ${selected.includes(s.id) ? 'dipilih' : statusLabel[s.status]}`}
                            onClick={() => toggle(s.id)}
                          >
                            {row}{s.number}{s.status === 'SOLD' ? ' ×' : s.status === 'RESERVED' ? ' −' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <button
            className="text-link refresh-button"
            disabled={refreshing || busy}
            onClick={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Memperbarui...' : 'Perbarui ketersediaan'}
          </button>
          <p className="seat-sync-note">Diperbarui setiap 5 detik.</p>
        </section>

        <aside className="seat-summary">
          <h2>Ringkasan pesanan</h2>
          <div className="summary-event">
            <MapPin size={18} />
            <span>{title}</span>
          </div>

          <form onSubmit={submit}>
            {chosen.length === 0 ? (
              <p className="selection-empty">Pilih kursi dari peta atau daftar.</p>
            ) : (
              <>
                {/* Kontak Pemesan */}
                <div style={{ background: '#fff', border: '1.5px solid var(--ink)', borderRadius: 10, padding: 16, margin: '16px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <User size={18} style={{ color: 'var(--purple)' }} />
                    <strong style={{ fontSize: 14 }}>Kontak Pemesan</strong>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700 }}>
                      Nama Pemesan
                      <input
                        required
                        maxLength={100}
                        value={bookerName}
                        disabled={busy}
                        onChange={e => setBookerName(e.target.value)}
                        placeholder="Nama lengkap pemesan"
                        style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}
                      />
                    </label>

                    <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700 }}>
                      Email Pemesan (Tiket dikirim ke sini)
                      <input
                        required
                        type="email"
                        maxLength={254}
                        value={bookerEmail}
                        disabled={busy}
                        onChange={e => setBookerEmail(e.target.value)}
                        placeholder="nama@email.com"
                        style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}
                      />
                    </label>

                    <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700 }}>
                      No. WhatsApp / HP
                      <input
                        type="tel"
                        maxLength={30}
                        value={bookerPhone}
                        disabled={busy}
                        onChange={e => setBookerPhone(e.target.value)}
                        placeholder="08xxxxxxxxxx"
                        style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}
                      />
                    </label>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginTop: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={syncFirstTicket}
                      onChange={e => setSyncFirstTicket(e.target.checked)}
                      style={{ accentColor: 'var(--purple)' }}
                    />
                    <span>Samakan peserta tiket #1 dengan nama pemesan</span>
                  </label>
                </div>

                {/* Formulir Peserta Tambahan */}
                <div className="selected-seats">
                  <div style={{ fontSize: 13, fontWeight: 800, margin: '8px 0 2px' }}>
                    Detail Peserta ({chosen.length} Kursi)
                  </div>

                  {chosen.map((s, idx) => {
                    const isExpanded = expandedSeat === s.id || chosen.length === 1;

                    return (
                      <div className="selected-seat" key={s.id} style={{ background: '#fff', border: '1px solid var(--ink)', borderRadius: 8, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong>{s.section} {s.row}{s.number} (Tiket #{idx + 1})</strong>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setExpandedSeat(isExpanded ? null : s.id)}
                              style={{ border: 0, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}
                            >
                              {isExpanded ? <><ChevronUp size={14} /> Tutup Form</> : <><ChevronDown size={14} /> Lengkapi Data</>}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggle(s.id)}
                              aria-label={`Hapus ${s.row}${s.number}`}
                              style={{ color: 'var(--danger)', fontSize: 11 }}
                            >
                              Hapus
                            </button>
                          </div>
                        </div>

                        <label style={{ display: 'grid', gap: 4, fontSize: 11, fontWeight: 700 }}>
                          Nama Peserta (Wajib)
                          <input
                            required
                            maxLength={100}
                            value={names[s.id] ?? (idx === 0 && syncFirstTicket ? bookerName : '')}
                            disabled={busy}
                            onChange={e => setNames({ ...names, [s.id]: e.target.value })}
                            placeholder="Masukkan nama lengkap peserta"
                            style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}
                          />
                        </label>

                        {isExpanded && (
                          <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
                            <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
                              <span>Email Peserta (Opsional, untuk kirim e-ticket langsung)</span>
                              <input
                                type="email"
                                value={emails[s.id] ?? ''}
                                disabled={busy}
                                onChange={e => setEmails({ ...emails, [s.id]: e.target.value })}
                                placeholder="peserta@email.com"
                                style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}
                              />
                            </label>

                            <label style={{ display: 'grid', gap: 4, fontSize: 11 }}>
                              <span>Kebutuhan Khusus / Aksesibilitas (Opsional)</span>
                              <input
                                value={notes[s.id] ?? ''}
                                disabled={busy}
                                onChange={e => setNotes({ ...notes, [s.id]: e.target.value })}
                                placeholder="Contoh: Kursi roda, pendamping lansia"
                                style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="price-breakdown">
              <p>
                <span>{category?.name ?? 'Kategori'} × {chosen.length}</span>
                <strong>{rupiah((category?.price ?? 0) * chosen.length)}</strong>
              </p>
              <p>
                <span>Biaya layanan demo</span>
                <span>Rp0</span>
              </p>
              <div>
                <strong>Total</strong>
                <strong>{rupiah((category?.price ?? 0) * chosen.length)}</strong>
              </div>
            </div>

            <label className="terms-check">
              <input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)} required />
              <span>Saya memahami reservasi berlaku 10 menit. Ini adalah simulasi tanpa pembayaran nyata.</span>
            </label>

            <button className="button reserve-button" disabled={busy || !chosen.length || !terms || !!error} type="submit">
              {busy ? 'Memproses...' : 'Reservasi 10 menit'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div role="status" aria-live="polite" className="seat-feedback">{message}</div>
          {error && <div role="alert" className="form-error">{error}</div>}
        </aside>
      </div>

      <ConcurrencySimulatorModal
        isOpen={showSimulator}
        onClose={() => setShowSimulator(false)}
        slug={data.slug}
        categories={data.categories}
        seats={data.seats}
        activeCategoryId={categoryId}
        selectedSeatId={selected[0]}
        onSimulationComplete={refresh}
      />
    </>
  );
}
