'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Trash2, RefreshCw, MapPin, User, Mail, Phone, Sparkles, ChevronDown, ChevronUp, Zap, Tag, Ticket as TicketIcon } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import { statusLabel, type Inventory } from './types';
import { ConcurrencySimulatorModal } from './concurrency-simulator-modal';
import { calculateApplicablePromo, type Promo } from '@/features/promos/core';

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

  // Promos & Vouchers
  const [promos, setPromos] = useState<Promo[]>([]);
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');
  const [voucherError, setVoucherError] = useState('');

  useEffect(() => {
    fetch(`/api/events/${initial.slug}/promos`)
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d?.promos) ? d.promos : Array.isArray(d) ? d : [];
        setPromos(list);
      })
      .catch(() => {});
  }, [initial.slug]);

  const category = data.categories.find(c => c.id === categoryId);
  const chosen = data.seats.filter(s => selected.includes(s.id));
  const reservationHint = busy ? 'Reservasi sedang diproses.' : !chosen.length ? 'Pilih minimal satu kursi untuk melanjutkan.' : error ? 'Perbarui ketersediaan kursi sebelum melanjutkan.' : !terms ? 'Setujui ketentuan reservasi di bawah untuk melanjutkan.' : 'Lengkapi data pemesan dan peserta, lalu lanjutkan reservasi.';
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
        voucherCode: appliedVoucher || undefined,
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
  const subtotal = (category?.price ?? 0) * chosen.length;
  const promoCalculation = calculateApplicablePromo(
    promos,
    { categoryId, quantity: chosen.length, subtotal },
    appliedVoucher || undefined
  );
  const discountAmount = chosen.length > 0 ? promoCalculation.discountAmount : 0;
  const finalTotal = chosen.length > 0 ? promoCalculation.finalTotal : 0;

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
              const autoPromo = calculateApplicablePromo(
                promos.filter(p => p.type === 'AUTOMATIC'),
                { categoryId: c.id, quantity: 1, subtotal: c.price }
              );

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
                  {autoPromo.discountAmount > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ textDecoration: 'line-through', color: 'var(--muted)', fontSize: 12 }}>
                        {rupiah(c.price)}
                      </span>
                      <strong style={{ color: 'var(--red, #e11d48)' }}>
                        {rupiah(c.price - autoPromo.discountAmount)}
                      </strong>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        background: 'var(--orange, #ff6b35)',
                        color: '#fff',
                        padding: '1px 5px',
                        borderRadius: 4
                      }}>
                        {autoPromo.appliedPromo?.discountType === 'PERCENT'
                          ? `Diskon ${autoPromo.appliedPromo.discountValue}%`
                          : `Diskon ${rupiah(autoPromo.discountAmount)}`}
                      </span>
                    </div>
                  ) : (
                    <span>{rupiah(c.price)} / orang</span>
                  )}
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
                <span>Simulasi War Tiket</span>
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
                        {isSelected ? 'OK' : s.status === 'SOLD' ? '×' : s.status === 'RESERVED' ? '−' : s.number}
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

          <button data-icon-action="" aria-label="Perbarui ketersediaan kursi" title="Perbarui ketersediaan kursi"
            className="text-link refresh-button"
            disabled={refreshing || busy}
            onClick={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          ><RefreshCw size={20} className={refreshing ? 'spin' : ''} aria-hidden="true" /></button>
          <p className="seat-sync-note">Diperbarui setiap 5 detik.</p>
        </section>

        <aside className="seat-summary" id="seat-order-summary">
          <h2>Ringkasan pesanan</h2>
          <div className="summary-event">
            <MapPin size={18} />
            <span>{title}</span>
          </div>

          <form onSubmit={submit} id="seat-reservation-form">
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
                    const isExpanded = expandedSeat === s.id;

                    return (
                      <div className="selected-seat" key={s.id} style={{ background: '#fff', border: '1px solid var(--ink)', borderRadius: 8, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <strong>{s.section} {s.row}{s.number} (Tiket #{idx + 1})</strong>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              type="button"
                              data-icon-action="" aria-label={isExpanded ? 'Tutup detail peserta' : 'Lengkapi detail peserta'} title={isExpanded ? 'Tutup detail peserta' : 'Lengkapi detail peserta'} aria-expanded={isExpanded} onClick={() => setExpandedSeat(isExpanded ? null : s.id)}
                              style={{ border: 0, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--purple)', fontWeight: 700 }}
                            >
                              {isExpanded ? <ChevronUp size={20} aria-hidden="true"/> : <ChevronDown size={20} aria-hidden="true"/>}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggle(s.id)}
                              data-icon-action="" title={`Hapus kursi ${s.row}${s.number}`} aria-label={`Hapus kursi ${s.row}${s.number}`}
                              style={{ color: 'var(--danger)', fontSize: 11 }}
                            >
                              <Trash2 size={18} aria-hidden="true"/>
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

            {/* Voucher input form */}
            <div style={{ margin: '14px 0', padding: '12px', background: 'var(--cream)', border: '1.5px solid var(--ink)', borderRadius: 8, boxShadow: '2px 2px 0 var(--ink)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 700, fontSize: 13 }}>
                <Tag size={15} />
                <span>Punya Kode Voucher?</span>
              </div>
              {appliedVoucher ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#dcfce7', border: '1.5px solid #16a34a', padding: '8px 12px', borderRadius: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#166534' }}>
                    <TicketIcon size={16} />
                    <span>Voucher: {appliedVoucher}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedVoucher('');
                      setVoucherError('');
                    }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder="Contoh: HEMAT30K"
                    value={voucherCodeInput}
                    disabled={busy}
                    onChange={e => {
                      setVoucherCodeInput(e.target.value.toUpperCase());
                      setVoucherError('');
                    }}
                    style={{ flex: 1, textTransform: 'uppercase', padding: '6px 10px', fontSize: 12, border: '1.5px solid var(--ink)', borderRadius: 6, background: '#fff' }}
                  />
                  <button
                    type="button"
                    className="button button-small"
                    style={{ padding: '6px 12px', fontSize: 12 }}
                    disabled={busy || !voucherCodeInput.trim()}
                    onClick={() => {
                      const code = voucherCodeInput.trim().toUpperCase();
                      const check = calculateApplicablePromo(
                        promos,
                        { categoryId, quantity: chosen.length || 1, subtotal: (category?.price ?? 0) * (chosen.length || 1) },
                        code
                      );
                      if (check.appliedPromo?.code?.toUpperCase() === code) {
                        setAppliedVoucher(code);
                        setVoucherCodeInput('');
                        setVoucherError('');
                      } else {
                        setVoucherError('Kode voucher tidak valid atau syarat belum terpenuhi.');
                      }
                    }}
                  >
                    Pakai
                  </button>
                </div>
              )}
              {voucherError && <p style={{ margin: '6px 0 0', color: 'var(--red, #e11d48)', fontSize: 11, fontWeight: 600 }}>{voucherError}</p>}
            </div>

            <div className="price-breakdown">
              <p>
                <span>{category?.name ?? 'Kategori'} × {chosen.length}</span>
                <strong>{rupiah(subtotal)}</strong>
              </p>
              {discountAmount > 0 && (
                <p style={{ color: 'var(--red, #e11d48)' }}>
                  <span>Diskon ({promoCalculation.appliedPromo?.name})</span>
                  <strong>- {rupiah(discountAmount)}</strong>
                </p>
              )}
              <p>
                <span>Biaya layanan demo</span>
                <span>Rp0</span>
              </p>
              <div>
                <strong>Total</strong>
                <strong>{rupiah(finalTotal)}</strong>
              </div>
            </div>

            <label className="terms-check">
              <input type="checkbox" checked={terms} disabled={busy} onChange={e => setTerms(e.target.checked)} required />
              <span>Saya memahami reservasi berlaku 10 menit. Ini adalah simulasi tanpa pembayaran nyata.</span>
            </label>

            <p id="reservation-hint" className="reservation-hint" aria-live="polite">{reservationHint}</p>
            <button className="button reserve-button" aria-describedby="reservation-hint" disabled={busy || !chosen.length || !terms || !!error} type="submit">
              {busy ? 'Memproses...' : 'Reservasi 10 menit'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div role="status" aria-live="polite" className="seat-feedback">{message}</div>
          {error && <div role="alert" className="form-error">{error}</div>}
        </aside>
      </div>

      <div className="seat-mobile-bar" aria-label="Ringkasan kursi pilihan">
        <div aria-live="polite"><span>{chosen.length} kursi dipilih</span><strong>{rupiah(finalTotal)}</strong></div>
        <a href="#seat-order-summary" className="button button-small">{chosen.length ? 'Lengkapi pesanan' : 'Lihat ringkasan'}<ArrowRight size={16} aria-hidden="true"/></a>
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
