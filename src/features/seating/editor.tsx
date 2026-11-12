"use client";
import { FieldLabel } from '@/components/form-fields';
import { useConfirmation } from '@/components/confirmation-dialog';
import { NumberInput } from '@/components/number-input';
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Plus, Save, Trash2 } from "lucide-react";
import { ZodError } from "zod";
import {
  categoryFields,
  layoutInput,
  seatingConfigSchema,
  type SeatingConfig,
  type LayoutInput,
} from "./core";
type Category = LayoutInput["categories"][number];
const local = (v: string) =>
  new Date(Date.parse(v) + 25200000).toISOString().slice(0, 16);
const iso = (v: string) => new Date(v + ":00+07:00").toISOString();
export function SeatingEditor({
  eventId,
  locked,
  disabled,
}: {
  eventId: string;
  locked: boolean;
  disabled: boolean;
}) {
  const confirmAction=useConfirmation();
  const root = useRef<HTMLElement>(null);
  const [config, setConfig] = useState<SeatingConfig | null>(null),
    [draft, setDraft] = useState<LayoutInput | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [categoryId, setCategoryId] = useState(""),
    [cat, setCat] = useState<Category | null>(null);
  const [sectionName, setSectionName] = useState(""),
    [sectionTarget, setSectionTarget] = useState(""),
    [rowNames, setRowNames] = useState("A,B,C"),
    [perRow, setPerRow] = useState(8);
  const [selected, setSelected] = useState<{
    section: number;
    seat: number;
  } | null>(null);
  function accept(data: unknown) {
    const c = seatingConfigSchema.parse(data);
    setConfig(c);
    setDraft({ ...c, expectedVersion: c.version });
    setCategoryId(c.categories[0]?.id ?? "");
    setCat(c.categories[0] ?? null);
    setSelected(null);
    setSectionTarget("");
  }
  async function load() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/organizer/events/" + eventId + "/seating", {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      accept(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Denah gagal dimuat.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [eventId]);
  async function save(layout: boolean) {
    if (!draft || !config) return;
    const scope = root.current?.querySelector(layout ? '[data-layout-fields]' : '[data-category-fields]');
    const invalid = scope?.querySelector<HTMLInputElement>('input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    if (
      !layout &&
      (draft.width !== config.width ||
        draft.height !== config.height ||
        JSON.stringify(draft.sections) !== JSON.stringify(config.sections) ||
        JSON.stringify(draft.categories) !== JSON.stringify(config.categories))
    ) {
      setError(
        "Simpan atau muat ulang draf denah sebelum mengubah kategori secara terpisah.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = layout
        ? layoutInput.parse(draft)
        : categoryFields.parse(cat);
      if (
        layout &&
        !await confirmAction(
          "Denah, kategori, dan paket tiket akan diganti dengan konfigurasi draf ini. Periksa kembali jumlah dan posisi kursi sebelum menyimpan.",{title:'Simpan denah baru?',confirmLabel:'Simpan denah'},
        )
      )
        return;
      const path =
        "/api/organizer/events/" +
        eventId +
        (layout
          ? "/seating"
          : "/categories" + (categoryId ? "/" + categoryId : ""));
      const r = await fetch(path, {
        method: layout ? "PUT" : categoryId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, expectedVersion: config.version }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      accept(d);
      setMessage(
        layout
          ? "Denah disimpan."
          : "Kategori disimpan. Harga tiket lama tetap.",
      );
    } catch (e) {
      setError(
        e instanceof ZodError
          ? e.issues
              .slice(0, 3)
              .map((x) => x.message)
              .join("\n")
          : e instanceof Error
            ? e.message
            : "Gagal menyimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  function addSection() {
    if (!draft) return;
    setError("");
    const names = rowNames
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      name =
        sectionTarget === ""
          ? sectionName.trim()
          : draft.sections[Number(sectionTarget)]?.name;
    if (
      !name ||
      (sectionTarget === "" && draft.sections.some((s) => s.name === name)) ||
      !names.length ||
      new Set(names).size !== names.length ||
      names.some((n) => n.length > 12) ||
      !Number.isInteger(perRow) ||
      perRow < 1 ||
      perRow > 100
    ) {
      setError(
        "Nama section harus unik. Isi label baris dipisah koma dan 1–100 kursi per baris.",
      );
      return;
    }
    const y = Math.max(
      110,
      ...draft.sections.flatMap((s) => s.seats.map((x) => x.y + 100)),
    );
    const target =
      sectionTarget === "" ? null : draft.sections[Number(sectionTarget)];
    const seats = names.flatMap((row, i) => {
      const existing = target?.seats.filter((s) => s.row === row) ?? [];
      const lastNumber = Math.max(0, ...existing.map((s) => s.number));
      const startX = existing.length
        ? Math.max(...existing.map((s) => s.x)) + 56
        : 60;
      const rowY = existing[0]?.y ?? y + i * 56;
      return Array.from({ length: perRow }, (_, n) => ({
        row,
        number: lastNumber + n + 1,
        x: startX + n * 56,
        y: rowY,
      }));
    });
    const next = {
      ...draft,
      sections: target
        ? draft.sections.map((s, i) =>
            i === Number(sectionTarget)
              ? { ...s, seats: [...s.seats, ...seats] }
              : s,
          )
        : [...draft.sections, { name, seats }],
      width: Math.max(draft.width, ...seats.map((s) => s.x + 60)),
      height: Math.max(draft.height, ...seats.map((s) => s.y + 60)),
    };
    if (
      next.sections.length > 20 ||
      seats.some((s) => s.number > 9999) ||
      next.sections.flatMap((s) => s.seats).length > 2000 ||
      next.width > 10000 ||
      next.height > 10000
    ) {
      setError("Maksimal 2.000 kursi dan ukuran 10.000 × 10.000.");
      return;
    }
    setDraft(next);
    setSectionName("");
  }
  const seat =
    selected && draft?.sections[selected.section]?.seats[selected.seat];
  function changeSeat(field: "row" | "number" | "x" | "y", value: string) {
    if (!draft || !selected) return;
    setDraft({
      ...draft,
      sections: draft.sections.map((s, i) =>
        i !== selected.section
          ? s
          : {
              ...s,
              seats: s.seats.map((x, j) =>
                j !== selected.seat
                  ? x
                  : { ...x, [field]: field === "row" ? value : Number(value) },
              ),
            },
      ),
    });
  }
  return (
    <section ref={root} className="manage-card">
      <div className="manage-heading">
        <div>
          <h2>Kategori dan denah</h2>
          <p>Maksimal 2.000 kursi. Semua waktu dalam WIB.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Muat ulang denah"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!config || !draft ? (
        <p role="status">
          {busy ? "Memuat denah..." : "Denah belum tersedia."}
        </p>
      ) : (
        <>
          <fieldset data-category-fields disabled={busy || disabled} className="manage-fieldset">
            <legend>Pengaturan kategori</legend>
            <FieldLabel>
              Kategori
              <select
                value={categoryId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCategoryId(id);
                  setCat(
                    config.categories.find((x) => x.id === id) ?? {
                      name: "",
                      price: 0,
                      quota: 1,
                      salesStart: config.categories[0]?.salesStart ?? "",
                      salesEnd: config.categories[0]?.salesEnd ?? "",
                      sections: [],
                      active: true,
                    },
                  );
                }}
              >
                {config.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.active ? "" : " (nonaktif)"}
                  </option>
                ))}
                <option value="">+ Kategori baru</option>
              </select>
            </FieldLabel>
            {cat && (
              <>
                <div className="editor-grid">
                  <FieldLabel>
                    Nama kategori
                    <input
                      required
                      maxLength={80}
                      value={cat.name}
                      onChange={(e) => setCat({ ...cat, name: e.target.value })}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Harga (Rp)
                    <NumberInput required
                      type="number"
                      min={0}
                      max={100000000}
                      step={1}
                      value={cat.price}
                      onChange={(e) =>
                        setCat({ ...cat, price: Number(e.target.value) })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Kuota
                    <NumberInput required
                      type="number"
                      min={1}
                      max={2000}
                      step={1}
                      value={cat.quota}
                      onChange={(e) =>
                        setCat({ ...cat, quota: Number(e.target.value) })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Penjualan mulai (WIB)
                    <input
                      type="datetime-local"
                      required
                      value={cat.salesStart ? local(cat.salesStart) : ""}
                      onChange={(e) => {
                        if (e.target.value)
                          setCat({ ...cat, salesStart: iso(e.target.value) });
                      }}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Penjualan selesai (WIB)
                    <input
                      type="datetime-local"
                      required
                      value={cat.salesEnd ? local(cat.salesEnd) : ""}
                      onChange={(e) => {
                        if (e.target.value)
                          setCat({ ...cat, salesEnd: iso(e.target.value) });
                      }}
                    />
                  </FieldLabel>
                </div>
                <fieldset className="manage-checks">
                  <legend>Section yang dapat dipilih</legend>
                  {config.sections.map((s) => (
                    <FieldLabel key={s.id}>
                      <input
                        type="checkbox"
                        checked={cat.sections.includes(s.name)}
                        onChange={(e) =>
                          setCat({
                            ...cat,
                            sections: e.target.checked
                              ? [...cat.sections, s.name]
                              : cat.sections.filter((x) => x !== s.name),
                          })
                        }
                      />
                      {s.name} ({s.seats.length} kursi)
                    </FieldLabel>
                  ))}
                </fieldset>
                <FieldLabel className="manage-check">
                  <input
                    type="checkbox"
                    checked={cat.active}
                    onChange={(e) =>
                      setCat({ ...cat, active: e.target.checked })
                    }
                  />
                  Kategori aktif
                </FieldLabel>
                <p className="manage-hint">
                  Kuota tidak boleh di bawah kursi terjual atau ditahan. Section
                  kategori yang sudah dipesan terkunci.
                </p>
                <button className="button" onClick={() => void save(false)}>
                  <Save size={16} />
                  Simpan kategori
                </button>
              </>
            )}
          </fieldset>
          <details className="manage-layout">
            <summary>Edit denah, section, dan kursi</summary>
            {locked ? (
              <p>
                Denah terkunci. Penggantian hanya untuk draf atau event
                tersembunyi yang belum pernah punya pesanan. Duplikasi event
                untuk membuat denah baru.
              </p>
            ) : (
              <fieldset data-layout-fields disabled={busy || disabled} className="manage-fieldset">
                <div className="editor-grid">
                  <FieldLabel>
                    Lebar denah
                    <NumberInput required
                      type="number"
                      min={320}
                      max={10000}
                      value={draft.width}
                      onChange={(e) =>
                        setDraft({ ...draft, width: Number(e.target.value) })
                      }
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Tinggi denah
                    <NumberInput required
                      type="number"
                      min={240}
                      max={10000}
                      value={draft.height}
                      onChange={(e) =>
                        setDraft({ ...draft, height: Number(e.target.value) })
                      }
                    />
                  </FieldLabel>
                </div>
                <div className="manage-section-list">
                  {draft.sections.map((s, i) => (
                    <div key={i}>
                      <FieldLabel>
                        Nama section
                        <input
                          maxLength={80}
                          value={s.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setDraft({
                              ...draft,
                              sections: draft.sections.map((x, j) =>
                                j === i ? { ...x, name } : x,
                              ),
                              categories: draft.categories.map((c) => ({
                                ...c,
                                sections: c.sections.map((n) =>
                                  n === s.name ? name : n,
                                ),
                              })),
                            });
                          }}
                        />
                      </FieldLabel>
                      <span>{s.seats.length} kursi</span>
                      <button
                        className="icon-button"
                        aria-label={"Hapus section " + s.name}
                        onClick={async () => {
                          if (
                            await confirmAction(
                              "Section dan seluruh kursinya akan dihapus dari draf denah.",{title:'Hapus section?',confirmLabel:'Hapus section',destructive:true},
                            )
                          ) {
                            setDraft({
                              ...draft,
                              sections: draft.sections.filter(
                                (_, j) => j !== i,
                              ),
                              categories: draft.categories.map((c) => ({
                                ...c,
                                sections: c.sections.filter(
                                  (n) => n !== s.name,
                                ),
                              })),
                            });
                            setSelected(null);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="editor-grid">
                  <FieldLabel>
                    Tambahkan ke section
                    <select
                      value={sectionTarget}
                      onChange={(e) => setSectionTarget(e.target.value)}
                    >
                      <option value="">Section baru</option>
                      {draft.sections.map((s, i) => (
                        <option key={i} value={String(i)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel>
                    Section baru
                    <input
                      disabled={sectionTarget !== ""}
                      value={sectionName}
                      maxLength={80}
                      placeholder="Contoh: VIP"
                      onChange={(e) => setSectionName(e.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Label baris
                    <input
                      value={rowNames}
                      placeholder="A,B,C"
                      onChange={(e) => setRowNames(e.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel>
                    Kursi per baris
                    <NumberInput required
                      type="number"
                      min={1}
                      max={100}
                      value={perRow}
                      onChange={(e) => setPerRow(Number(e.target.value))}
                    />
                  </FieldLabel>
                </div>
                <button className="button button-light" onClick={addSection}>
                  <Plus size={16} />
                  Tambah kursi dan baris
                </button>
                <p className="manage-hint">
                  Untuk menambah kursi pada baris yang ada, pilih section dan
                  isi label baris yang sama. Klik kursi untuk mengubah nomor dan
                  posisi.
                </p>
                <div
                  className="manage-map"
                  tabIndex={0}
                  role="region"
                  aria-label="Pratinjau denah yang dapat digulir"
                >
                  <div
                    style={{
                      position: "relative",
                      width: draft.width,
                      height: draft.height,
                    }}
                  >
                    <div className="manage-stage">PANGGUNG</div>
                    {draft.sections.flatMap((s, i) =>
                      s.seats.map((x, j) => (
                        <button
                          type="button"
                          key={i + ":" + j}
                          className={
                            "manage-seat" +
                            (selected?.section === i && selected.seat === j
                              ? " selected"
                              : "")
                          }
                          style={{ left: x.x - 18, top: x.y - 18 }}
                          aria-label={
                            s.name + ", baris " + x.row + ", kursi " + x.number
                          }
                          aria-pressed={
                            selected?.section === i && selected.seat === j
                          }
                          onClick={() => setSelected({ section: i, seat: j })}
                        >
                          {x.row}
                          {x.number}
                        </button>
                      )),
                    )}
                  </div>
                </div>
                {seat && selected && (
                  <div className="editor-grid">
                    <FieldLabel>
                      Baris
                      <input
                        required
                        value={seat.row}
                        maxLength={12}
                        onChange={(e) => changeSeat("row", e.target.value)}
                      />
                    </FieldLabel>
                    {(["number", "x", "y"] as const).map((k) => (
                      <FieldLabel key={k}>
                        {k === "number" ? "Nomor kursi" : k.toUpperCase()}
                        <NumberInput required
                          type="number"
                          value={seat[k]}
                          onChange={(e) => changeSeat(k, e.target.value)}
                        />
                      </FieldLabel>
                    ))}
                    <button
                      className="button button-light"
                      onClick={() => {
                        setDraft({
                          ...draft,
                          sections: draft.sections.map((s, i) =>
                            i !== selected.section
                              ? s
                              : {
                                  ...s,
                                  seats: s.seats.filter(
                                    (_, j) => j !== selected.seat,
                                  ),
                                },
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      Hapus kursi
                    </button>
                    <button
                      className="button button-light"
                      onClick={async () => {
                        if (
                          !await confirmAction(
                            "Hapus seluruh kursi baris " +
                              seat.row +
                              " dari section ini?",{title:'Hapus baris kursi?',confirmLabel:'Hapus baris',destructive:true},
                          )
                        )
                          return;
                        setDraft({
                          ...draft,
                          sections: draft.sections.map((s, i) =>
                            i !== selected.section
                              ? s
                              : {
                                  ...s,
                                  seats: s.seats.filter(
                                    (x) => x.row !== seat.row,
                                  ),
                                },
                          ),
                        });
                        setSelected(null);
                      }}
                    >
                      Hapus baris
                    </button>
                  </div>
                )}
                <h3>Kategori pada draf denah</h3>
                <p className="manage-hint">
                  Kategori di bawah ikut disimpan saat mengganti denah.
                </p>
                {draft.categories.map((c, i) => (
                  <div className="manage-draft-category" key={i}>
                    <FieldLabel>
                      Nama
                      <input
                        required
                        maxLength={80}
                        value={c.name}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            categories: draft.categories.map((x, j) =>
                              i === j ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Harga (Rp)
                      <NumberInput required
                        type="number"
                        min={0}
                        max={100000000}
                        value={c.price}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            categories: draft.categories.map((x, j) =>
                              i === j
                                ? { ...x, price: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </FieldLabel>
                    <FieldLabel>
                      Kuota
                      <NumberInput required
                        type="number"
                        min={1}
                        max={2000}
                        value={c.quota}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            categories: draft.categories.map((x, j) =>
                              i === j
                                ? { ...x, quota: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      />
                    </FieldLabel>
                    <fieldset className="manage-checks">
                      <legend>Section</legend>
                      {draft.sections.map((s, j) => (
                        <FieldLabel key={j}>
                          <input
                            type="checkbox"
                            checked={c.sections.includes(s.name)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                categories: draft.categories.map((x, k) =>
                                  i === k
                                    ? {
                                        ...x,
                                        sections: e.target.checked
                                          ? [...x.sections, s.name]
                                          : x.sections.filter(
                                              (n) => n !== s.name,
                                            ),
                                      }
                                    : x,
                                ),
                              })
                            }
                          />
                          {s.name}
                        </FieldLabel>
                      ))}
                    </fieldset>
                    <button
                      className="text-link"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          categories: draft.categories.filter(
                            (_, j) => j !== i,
                          ),
                        })
                      }
                    >
                      Hapus kategori
                    </button>
                  </div>
                ))}
                <div className="manage-actions">
                  <button
                    className="button button-light"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        categories: [
                          ...draft.categories,
                          {
                            name: "Kategori " + (draft.categories.length + 1),
                            price: 0,
                            quota: 1,
                            salesStart: config.categories[0].salesStart,
                            salesEnd: config.categories[0].salesEnd,
                            sections: [draft.sections[0]?.name ?? ""],
                            active: true,
                          },
                        ],
                      })
                    }
                  >
                    Tambah kategori draf
                  </button>
                  <button className="button" onClick={() => void save(true)}>
                    <Save size={16} />
                    Simpan seluruh denah
                  </button>
                </div>
              </fieldset>
            )}
          </details>
        </>
      )}
    </section>
  );
}
