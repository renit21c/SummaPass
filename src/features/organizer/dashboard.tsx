"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Download,
  Pencil,
  RefreshCw,
  LayoutDashboard,
  CalendarDays,
  Users,
  Wallet,
  Ticket,
  Search,
  Copy,
} from "lucide-react";
import { metrics, type OrganizerSnapshot } from "./core";
import { rupiah } from "@/features/events/data";
const statuses: Record<string, string> = {
  PENDING_PAYMENT: "Menunggu bayar",
  CONFIRMED: "Dikonfirmasi",
  FAILED: "Gagal bayar",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};
const eventStatuses: Record<string, string> = {
  PUBLISHED: "Dipublikasikan",
  DRAFT: "Draf",
  UNPUBLISHED: "Disembunyikan",
  ARCHIVED: "Diarsipkan",
};
export function OrganizerDashboard({
  data,
  range = {},
}: {
  data: OrganizerSnapshot;
  range?: { from?: string; to?: string };
}) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [duplicateError,setDuplicateError]=useState('');

  async function handleDuplicate(eventId: string) {
    if (duplicating) return;
    setDuplicating(eventId);
    setDuplicateError('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menduplikasi event.');
      const newId = data.event?.id ?? data.id;
      router.push(`/organizer/events/${newId}/edit`);
    } catch (err) {
      setDuplicateError(err instanceof Error ? err.message : 'Gagal menduplikasi event.');
      setDuplicating(null);
    }
  }
  const [tab, setTab] = useState("overview"),
    [event, setEvent] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [sort, setSort] = useState("recent");
  const scoped = {
    ...data,
    events: data.events.filter((e) => !event || e.slug === event),
    bookings: data.bookings.filter((b) => !event || b.slug === event),
    inventory: data.inventory.filter((i) => !event || i.slug === event),
  };
  const kpi = metrics(scoped);
  if (range.from || range.to)
    kpi.sold = scoped.bookings
      .filter((b) => b.status === "CONFIRMED" && b.paymentStatus === "PAID")
      .reduce((n, b) => n + b.items.length, 0);
  const rows = scoped.bookings
    .filter(
      (b) =>
        (!status || b.status === status) &&
        `${b.reference} ${b.items.map((i) => i.name).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "amount"
        ? b.total - a.total
        : Date.parse(b.expiresAt) - Date.parse(a.expiresAt),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 8)),
    current = Math.min(page, pages),
    visible = rows.slice((current - 1) * 8, current * 8);
  const chart = scoped.events.map((e) => ({
    name: e.title,
    paid: scoped.bookings
      .filter(
        (b) =>
          b.slug === e.slug &&
          b.status === "CONFIRMED" &&
          b.paymentStatus === "PAID",
      )
      .reduce((sum, b) => sum + b.total, 0),
  }));
  const params = new URLSearchParams();
  if (event) params.set("event", event);
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return (
    <div className="organizer-shell">
      <aside className="organizer-nav">
        <h1>Organizer</h1>
        <Link className="button" href="/organizer/events/new">
          + Tambah event
        </Link>
        <p>{data.mode === "demo" ? "Mode demo" : "Event yang ditugaskan"}</p>
        <nav aria-label="Dashboard organizer">
          {[
            { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
            { id: "events", label: "Event dan kursi", icon: CalendarDays },
            { id: "bookings", label: "Booking", icon: Ticket },
            { id: "attendees", label: "Peserta", icon: Users },
            { id: "payments", label: "Transaksi", icon: Wallet },
          ].map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              aria-pressed={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
            >
              <t.icon size={18} />
              {t.label}
            </button>
          ))}
        </nav>
        <Link href="/account" className="text-link">
          Kembali ke akun
        </Link>
      </aside>
      <section className="organizer-main">
        {duplicateError&&<p className="form-error" role="alert">{duplicateError}</p>}
        <div className="organizer-heading">
          <div>
            <h2>
              {tab === "overview"
                ? "Ringkasan"
                : tab === "events"
                  ? "Event dan kursi"
                  : tab === "bookings"
                    ? "Daftar reservasi"
                    : tab === "attendees"
                      ? "Peserta"
                      : "Transaksi simulasi"}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Perbarui dashboard"
            onClick={() => router.refresh()}
          >
            <RefreshCw size={19} />
          </button>
        </div>
        <label className="organizer-event-filter">
          Event
          <select
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua event ditugaskan</option>
            {data.events.map((e) => (
              <option value={e.slug} key={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        {data.mode === "demo" && (
          <p className="organizer-demo-notice">
            Demo lokal. Event awal memiliki 2 kursi terjual contoh. Pendapatan
            dihitung dari pembayaran simulasi lunas.
          </p>
        )}
        {tab === "overview" ? (
          <>
            <div className="organizer-kpis">
              {[
                {
                  label: "Pendapatan",
                  value: rupiah(kpi.revenue),
                  note: "Tidak termasuk pending atau gagal",
                },
                { label: "Tiket terjual", value: kpi.sold, note: "" },
                {
                  label: "Kursi tersedia",
                  value: kpi.available,
                  note: "Setelah hold aktif dan kuota",
                },
                {
                  label: "Menunggu pembayaran",
                  value: kpi.pending,
                  note: `Dari ${kpi.bookings} booking`,
                },
              ].map((k) => (
                <div className="organizer-kpi" key={k.label}>
                  <span>{k.label}</span>
                  <strong>{k.value}</strong>
                  {k.note && <p>{k.note}</p>}
                </div>
              ))}
            </div>
            <section className="organizer-chart">
              <h3>Pendapatan per event</h3>
              <p>Dari pembayaran lunas.</p>
              {kpi.revenue === 0 ? (
                <div className="organizer-empty">
                  Belum ada pembayaran lunas.
                </div>
              ) : (
                <div
                  className="chart-canvas"
                  role="img"
                  aria-label="Grafik pendapatan per event, angka lengkap tersedia pada daftar di bawah"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chart}
                      margin={{ left: 0, right: 16, bottom: 20, top: 10 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <YAxis
                        width={75}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${Number(v) / 1000}rb`}
                      />
                      <Tooltip formatter={(v) => rupiah(Number(v))} />
                      <Bar
                        dataKey="paid"
                        name="Pendapatan"
                        fill="var(--orange)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <ul className="chart-values">
                {chart.map((c) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <strong>{rupiah(c.paid)}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <div className="organizer-info">
              {data.attendance
                ? `Sudah check-in: ${data.attendance.filter((a) => !event || a.slug === event).reduce((n, a) => n + a.checkedIn, 0)} peserta.`
                : "Data kehadiran belum tersedia."}
            </div>
          </>
        ) : tab === "events" ? (
          <div className="organizer-events">
            {scoped.events.map((e) => {
              const inv = scoped.inventory.find((i) => i.slug === e.slug);
              return (
                <article className="organizer-event-card" key={e.id}>
                  <div>
                    <h3>{e.title}</h3>
                    <span>{eventStatuses[e.status] ?? e.status}</span>
                  </div>
                  {inv ? (
                    inv.categories.map((c) => {
                      const seats = inv.seats.filter((s) =>
                        c.sections.includes(s.section),
                      );
                      return (
                        <section key={c.id}>
                          <strong>{c.name}</strong>
                          <p>
                            {rupiah(c.price)} / kursi · Kuota {c.quota}
                          </p>
                          <div className="inventory-stats">
                            <span>
                              Tersedia{" "}
                              {Math.max(
                                0,
                                Math.min(
                                  seats.filter((s) => s.status === "AVAILABLE")
                                    .length,
                                  c.quota -
                                    seats.filter(
                                      (s) => s.status !== "AVAILABLE",
                                    ).length,
                                ),
                              )}
                            </span>
                            <span>
                              Ditahan{" "}
                              {
                                seats.filter((s) => s.status === "RESERVED")
                                  .length
                              }
                            </span>
                            <span>
                              Terjual{" "}
                              {seats.filter((s) => s.status === "SOLD").length}
                            </span>
                          </div>
                        </section>
                      );
                    })
                  ) : (
                    <p>Data kursi belum tersedia.</p>
                  )}
                  <div className="organizer-event-actions action-group">
                  <Link
                    data-icon-action="" aria-label={`Edit event ${e.title}`} title="Edit event" className="button"
                    href={`/organizer/events/${e.id}/edit`}
                  >
                    <Pencil size={20} aria-hidden="true"/>
                  </Link>
                  <button
                    type="button"
                    className="button button-light"
                    disabled={duplicating === e.id}
                    onClick={() => void handleDuplicate(e.id)}
                  >
                    <Copy size={16} aria-hidden="true" />
                    {duplicating === e.id ? 'Menduplikasi...' : 'Duplikat'}
                  </button>
                  {data.mode === "supabase" && (
                    <Link
                      className="button button-light"
                      href={"/organizer/events/" + e.id + "/manage"}
                    >
                      Denah, peserta, dan laporan
                    </Link>
                  )}
                  {e.status === "PUBLISHED" && (
                    <Link className="text-link" href={`/events/${e.slug}`}>
                      Lihat event
                    </Link>
                  )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <>
            <div className="organizer-table-controls">
              <label className="search-field">
                <Search size={17} />
                <span className="sr-only">Cari booking atau peserta</span>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari referensi atau nama peserta"
                />
              </label>
              <label>
                <span className="sr-only">Status booking</span>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua status</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Urutkan booking</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="recent">Terbaru</option>
                  <option value="amount">Total terbesar</option>
                </select>
              </label>
              <a data-icon-action="" aria-label="Unduh CSV transaksi" title="Unduh CSV transaksi" className="button" href={`/api/organizer/export?${params}`}><Download size={20} aria-hidden="true" /></a>
            </div>
            <p className="organizer-row-count">
              {rows.length} booking. CSV mencakup semua hasil filter.
            </p>
            <div className="organizer-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Referensi / event</th>
                    <th>
                      {tab === "attendees"
                        ? "Peserta & kursi"
                        : "Kategori / jumlah"}
                    </th>
                    <th>Status</th>
                    <th>Pembayaran</th>
                    <th>Total</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.reference}</strong>
                        <span>
                          {data.events.find((e) => e.slug === b.slug)?.title}
                        </span>
                      </td>
                      <td>
                        {tab === "attendees"
                          ? b.items.map((i) => (
                              <span key={i.seatId}>
                                {i.name} · {i.label}
                              </span>
                            ))
                          : `${b.categoryName} · ${b.items.length} kursi`}
                      </td>
                      <td>
                        <span
                          className={`organizer-status status-${b.status.toLowerCase()}`}
                        >
                          {statuses[b.status]}
                        </span>
                      </td>
                      <td>
                        {
                          {
                            PAID: "Lunas",
                            PENDING: "Pending",
                            FAILED: "Gagal",
                            EXPIRED: "Kedaluwarsa",
                            CANCELLED: "Dibatalkan",
                          }[b.paymentStatus ?? "PENDING"]
                        }
                      </td>
                      <td>{rupiah(b.total)}</td>
                      <td>
                        <details>
                          <summary>Lihat</summary>
                          <div className="booking-row-details">
                            {b.items.map((i) => (
                              <p key={i.seatId}>
                                {i.name}
                                <br />
                                {i.label} · {rupiah(i.price)}
                              </p>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <div className="organizer-empty">
                  Tidak ada reservasi sesuai filter.
                </div>
              )}
            </div>
            <div className="organizer-pagination">
              <button
                className="button button-light"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Sebelumnya
              </button>
              <span>
                Halaman {current} dari {pages}
              </span>
              <button
                className="button button-light"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Berikutnya
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
