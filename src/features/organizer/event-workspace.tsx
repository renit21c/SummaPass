"use client";
import Link from "next/link";
import { useConfirmation } from '@/components/confirmation-dialog';
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Mail,
  RefreshCw,
  Upload,
  Users,
  Map,
  BarChart3,
  Tag,
} from "lucide-react";
import type { ManagedEvent } from "@/features/catalog/core";
import { SeatingEditor } from "@/features/seating/editor";
import { PromosManager } from "./promos-manager";
import {
  attendeeChange,
  attendeeRow,
  inReportRange,
  parseAttendeeCsv,
  reportRange,
  type AttendeeRow,
} from "./tools-core";
type Announcement = {
  id: string;
  title: string;
  message: string;
  recipients: number;
  createdAt: string;
};
type Change = ReturnType<typeof attendeeChange.parse>;
export function EventWorkspace({
  event,
  mode,
}: {
  event: ManagedEvent;
  mode: string;
}) {
  const confirmAction=useConfirmation();
  const router = useRouter(),
    announceKey = useRef(crypto.randomUUID()),
    duplicateKey = useRef(crypto.randomUUID());
  const [tab, setTab] = useState("seating"),
    [rows, setRows] = useState<AttendeeRow[]>([]),
    [history, setHistory] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [query, setQuery] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  const [edited, setEdited] = useState<Change | null>(null),
    [reason, setReason] = useState(""),
    [imported, setImported] = useState<Change[]>([]);
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [start, setStart] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const base = "/api/organizer/events/" + event.id,
    disabled = event.status === "ARCHIVED" || !!event.cancelledAt;
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(base + "/tools", { cache: "no-store" }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRows(attendeeRow.array().parse(d.attendees));
      setHistory(d.announcements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (mode === "supabase") void load();
    else setLoading(false);
  }, [event.id, mode]);
  async function mutate(input: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(base + "/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan gagal.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function saveParticipants(changes: Change[]) {
    const d = await mutate({ action: "attendees", rows: changes, reason });
    if (d) {
      setEdited(null);
      setImported([]);
      setReason("");
      await load();
      setMessage(
        d.updated + " peserta diperbarui. Tiket dan kursi tetap sama.",
      );
    }
  }
  const range = reportRange.safeParse({
    from: from || undefined,
    to: to || undefined,
  });
  const filtered = rows.filter(
    (r) =>
      range.success &&
      inReportRange(r.createdAt, range.data) &&
      (r.name + " " + r.reference + " " + r.seat)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visible = filtered.slice((page - 1) * 15, page * 15),
    totalPages = Math.max(1, Math.ceil(filtered.length / 15));
  const paid = filtered.filter(
      (r) => r.status === "CONFIRMED" && r.paymentStatus === "PAID",
    ),
    present = paid.filter((r) => !!r.checkedInAt);
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const exportUrl = (type: string) =>
    base +
    "/reports?" +
    new URLSearchParams({ ...Object.fromEntries(params), type });
  const editable = (r: AttendeeRow) =>
    r.status === "CONFIRMED" &&
    r.paymentStatus === "PAID" &&
    !r.checkedInAt &&
    !disabled;
  if (mode !== "supabase")
    return (
      <main id="main" className="container section">
        <Link href="/organizer">Kembali ke organizer</Link>
        <h1>Kelola event</h1>
        <p>Pengelolaan lanjutan memerlukan mode Supabase.</p>
      </main>
    );
  return (
    <main id="main" className="container section event-workspace">
      <Link className="text-link" href="/organizer">
        Kembali ke organizer
      </Link>
      <div className="manage-heading">
        <div>
          <h1>{event.title}</h1>
          <p>Kelola peserta, denah, laporan, dan informasi acara.</p>
        </div>
        <Link
          className="button button-light"
          href={"/organizer/events/" + event.id + "/edit"}
        >
          Detail event
        </Link>
      </div>
      <nav className="manage-tabs" aria-label="Pengelolaan event">
        {[
          { id: "seating", label: event.seatingMode === "GENERAL_ADMISSION" ? "Kuota tiket" : "Denah dan kategori", icon: Map },
          { id: "promos", label: "Diskon & Voucher", icon: Tag },
          { id: "attendees", label: "Peserta", icon: Users },
          { id: "reports", label: "Laporan", icon: BarChart3 },
          { id: "announcements", label: "Pengumuman", icon: Mail },
          { id: "duplicate", label: "Duplikasi", icon: Copy },
        ].map((t) => (
          <button
            key={t.id}
            className={"chip" + (tab === t.id ? " active" : "")}
            aria-pressed={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setPage(1);
            }}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </nav>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="manage-success" role="status">
          {message}
        </p>
      )}
      {tab === "seating" ? (event.seatingMode === "GENERAL_ADMISSION" ? <section className="manage-card"><h2>Tiket tanpa kursi</h2><p>Kuota {event.regularQuota.toLocaleString('id-ID')} tiket. Harga dan kuota dapat diatur di detail event.</p><Link className="button" href={`/organizer/events/${event.id}/edit`}>Atur tiket</Link></section> : <SeatingEditor
          eventId={event.id}
          disabled={disabled}
          locked={
            loading ||
            !!error ||
            rows.length > 0 ||
            !["DRAFT", "UNPUBLISHED"].includes(event.status)
          }
        />
      ) : tab === "attendees" || tab === "reports" ? (
        <section className="manage-card">
          <div className="manage-heading">
            <h2>{tab === "attendees" ? "Daftar peserta" : "Laporan event"}</h2>
            <button
              className="icon-button"
              aria-label="Muat ulang peserta"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="editor-grid">
            <label>
              Dari tanggal pemesanan (WIB)
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Sampai tanggal (WIB)
              <input
                type="date"
                min={from || undefined}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Cari nama, referensi, atau kursi
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          </div>
          {!range.success && (
            <p role="alert" className="form-error">
              Periksa rentang tanggal.
            </p>
          )}
          {loading ? (
            <p role="status">Memuat peserta...</p>
          ) : (
            <>
              <div className="manage-kpis">
                <div>
                  <strong>{filtered.length}</strong>
                  <span>Peserta sesuai filter</span>
                </div>
                <div>
                  <strong>{paid.length}</strong>
                  <span>Peserta lunas</span>
                </div>
                <div>
                  <strong>{present.length}</strong>
                  <span>Sudah hadir</span>
                </div>
                <div>
                  <strong>
                    {paid.length
                      ? Math.round((present.length / paid.length) * 100)
                      : 0}
                    %
                  </strong>
                  <span>Kehadiran peserta lunas</span>
                </div>
              </div>
              <div className="manage-actions">
                {range.success && (
                  <>
                    <a data-icon-action="" aria-label="Unduh CSV peserta" title="Unduh CSV peserta"
                      className="button button-light"
                      href={exportUrl("attendees")}
                    ><Download size={20} aria-hidden="true" /></a>
                    <a data-icon-action="" aria-label="Unduh CSV kehadiran" title="Unduh CSV kehadiran"
                      className="button button-light"
                      href={exportUrl("attendance")}
                    ><Download size={20} aria-hidden="true" /></a>
                  </>
                )}
                <small>CSV memakai filter tanggal, mencakup semua nama.</small>
              </div>
              <div className="organizer-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Peserta</th>
                      <th>Pesanan</th>
                      <th>Kategori / kursi</th>
                      <th>Pembayaran</th>
                      <th>Kehadiran</th>
                      {tab === "attendees" && <th>Aksi</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.name}</strong>
                          <span>{r.email || "Email peserta belum diisi"}</span>
                        </td>
                        <td>{r.reference}</td>
                        <td>
                          {r.category}
                          <br />
                          {r.seat}
                        </td>
                        <td>
                          {r.paymentStatus === "PAID"
                            ? "Lunas"
                            : r.paymentStatus}
                        </td>
                        <td>{r.checkedInAt ? "Hadir" : "Belum hadir"}</td>
                        {tab === "attendees" && (
                          <td>
                            <button
                              className="text-link"
                              disabled={busy || !editable(r)}
                              onClick={() => {
                                setEdited(attendeeChange.parse(r));
                                setReason("");
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="organizer-empty">
                    Tidak ada peserta sesuai filter.
                  </p>
                )}
              </div>
              <div className="organizer-pagination">
                <button
                  className="button button-light"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Sebelumnya
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  className="button button-light"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </button>
              </div>
            </>
          )}
          {tab === "attendees" && (
            <>
              <p className="manage-hint">
                Hanya peserta lunas yang belum check-in dapat diedit. Email
                tiket tetap dikirim ke akun pemesan. PDF lama yang sudah
                terkirim tidak berubah; gunakan kirim ulang untuk PDF terbaru.
              </p>
              {edited && (
                <form
                  className="manage-edit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveParticipants([edited]);
                  }}
                >
                  <h3>Edit peserta</h3>
                  <fieldset
                    className="manage-fieldset"
                    disabled={busy || disabled}
                  >
                    <div className="editor-grid">
                      <label>
                        Nama
                        <input
                          required
                          maxLength={100}
                          value={edited.name}
                          onChange={(e) =>
                            setEdited({ ...edited, name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Email peserta
                        <input
                          type="email"
                          maxLength={254}
                          value={edited.email}
                          onChange={(e) =>
                            setEdited({ ...edited, email: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Catatan
                      <textarea
                        maxLength={500}
                        value={edited.notes}
                        onChange={(e) =>
                          setEdited({ ...edited, notes: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Alasan perubahan (5–500 karakter)
                      <input
                        required
                        minLength={5}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <div className="manage-actions">
                      <button className="button" type="submit">
                        Simpan peserta
                      </button>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => setEdited(null)}
                      >
                        Batal
                      </button>
                    </div>
                  </fieldset>
                </form>
              )}
              <details className="manage-layout">
                <summary>Impor perubahan peserta dari CSV</summary>
                <p>
                  Unduh template, ubah nama/email/catatan, lalu unggah kembali.
                  Jangan mengubah ID dan revision. Maksimal 500 peserta per
                  impor.
                </p>
                <a data-icon-action="" aria-label="Unduh data peserta untuk diedit" title="Unduh data peserta untuk diedit" className="text-link" href={exportUrl("import")}><Download size={20} aria-hidden="true" /></a>
                <label>
                  File CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={busy || loading || disabled}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setImported([]);
                      setError("");
                      if (!file) return;
                      try {
                        if (file.size > 1024 * 1024)
                          throw Error("CSV maksimal 1 MB.");
                        const changes = parseAttendeeCsv(await file.text());
                        if (
                          changes.some(
                            (x) =>
                              !rows.some(
                                (r) =>
                                  r.id === x.id &&
                                  r.revision === x.revision &&
                                  editable(r),
                              ),
                          )
                        )
                          throw Error(
                            "CSV memuat peserta terkunci, ID tidak sesuai event, atau versi lama. Unduh ulang data.",
                          );
                        setImported(changes);
                        setReason("");
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "CSV tidak valid.",
                        );
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                {imported.length > 0 && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await confirmAction(
                          "Terapkan perubahan untuk " +
                            imported.length +
                            " peserta?",{title:'Terapkan impor peserta?',confirmLabel:'Terapkan impor'},
                        )
                      )
                        void saveParticipants(imported);
                    }}
                  >
                    <p>{imported.length} peserta siap diperbarui.</p>
                    <div className="organizer-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Nama baru</th>
                            <th>Email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {imported.slice(0, 10).map((r) => (
                            <tr key={r.id}>
                              <td>{r.name}</td>
                              <td>{r.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <label>
                      Alasan impor
                      <input
                        required
                        minLength={5}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button className="button" disabled={busy || disabled}>
                      <Upload size={16} />
                      Terapkan impor
                    </button>
                  </form>
                )}
              </details>
            </>
          )}
        </section>
      ) : tab === "promos" ? (
        <PromosManager eventId={event.id} eventTitle={event.title} />
      ) : tab === "announcements" ? (
        <section className="manage-card">
          <h2>Kirim pengumuman</h2>
          <p>
            Dikirim melalui notifikasi dan antrean email, satu kali per akun
            pemesan yang sudah lunas dan punya tiket aktif.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !await confirmAction("Pengumuman akan dikirim ke notifikasi dan antrean email seluruh pemesan lunas yang memenuhi syarat.",{title:'Kirim pengumuman?',confirmLabel:'Kirim pengumuman'})
              )
                return;
              const d = await mutate({
                action: "announce",
                key: announceKey.current,
                title,
                message: body,
              });
              if (d) {
                announceKey.current = crypto.randomUUID();
                setTitle("");
                setBody("");
                await load();
                setMessage(d.recipients + " akun masuk antrean pengumuman.");
              }
            }}
          >
            <fieldset
              className="manage-fieldset"
              disabled={busy || disabled || loading}
            >
              <label>
                Judul (3–120 karakter)
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    announceKey.current = crypto.randomUUID();
                  }}
                />
              </label>
              <label>
                Isi (10–2.000 karakter)
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    announceKey.current = crypto.randomUUID();
                  }}
                />
              </label>
              <button className="button">
                <Mail size={16} />
                {busy ? "Mengirim..." : "Kirim pengumuman"}
              </button>
            </fieldset>
          </form>
          <h3>Riwayat pengumuman</h3>
          {!history.length ? (
            <p>Belum ada pengumuman.</p>
          ) : (
            <ul className="manage-history">
              {history.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong>
                  <p>{a.message}</p>
                  <small>
                    {a.recipients} penerima ·{" "}
                    {new Date(a.createdAt).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    WIB
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="manage-card">
          <h2>Duplikasi acara</h2>
          <p>
            Salin detail, cover, denah, dan kategori ke draf baru. Pesanan,
            peserta, tiket, dan tim tidak disalin. Periode jual bergeser
            mengikuti jadwal baru.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await mutate({
                action: "duplicate",
                key: duplicateKey.current,
                startsAt: new Date(start + ":00+07:00").toISOString(),
              });
              if (d) {
                if (d.warning) {
                  setMessage(d.warning);
                  setDuplicateId(d.id);
                } else router.push("/organizer/events/" + d.id + "/edit");
              }
            }}
          >
            <fieldset className="manage-fieldset" disabled={busy}>
              <label>
                Acara mulai yang baru (WIB)
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    duplicateKey.current = crypto.randomUUID();
                  }}
                />
              </label>
              <button className="button">
                <Copy size={16} />
                {busy ? "Menyalin..." : "Buat salinan draf"}
              </button>
            </fieldset>
          </form>
          {duplicateId && (
            <Link
              className="button button-light"
              href={"/organizer/events/" + duplicateId + "/edit"}
            >
              Buka draf salinan
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
