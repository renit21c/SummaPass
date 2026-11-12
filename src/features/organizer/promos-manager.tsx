'use client';
import { ValidatedForm, FieldLabel } from '@/components/form-fields';
import { NumberInput } from '@/components/number-input';
import { useConfirmation } from '@/components/confirmation-dialog';
import { useState, useEffect } from 'react';
import { Tag, Plus, CheckCircle2, ShieldAlert, Trash2, Calendar, Ticket, Percent, Sparkles, AlertCircle } from 'lucide-react';
import { rupiah } from '@/features/events/data';
import type { Promo, PromoType, DiscountType, PromoScope } from '../promos/core';

interface PromosManagerProps {
  eventId: string;
  categories?: { id: string; name: string }[];
  eventTitle?: string;
}

export function PromosManager({ eventId, categories = [] }: PromosManagerProps) {
  const confirmAction=useConfirmation();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [availableCategories, setAvailableCategories] = useState(categories);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<PromoType>('AUTOMATIC');
  const [showForm, setShowForm] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDiscountType, setFormDiscountType] = useState<DiscountType>('PERCENT');
  const [formDiscountValue, setFormDiscountValue] = useState<number>(15);
  const [formScope, setFormScope] = useState<PromoScope>('ALL');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formEndDate, setFormEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [formQuota, setFormQuota] = useState<string>('');
  const [formMinQuantity, setFormMinQuantity] = useState<string>('');

  async function loadPromos() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/promos`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memuat data diskon & voucher.');
      setPromos(data.promos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kendala.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (eventId) {
      void loadPromos();
      fetch(`/api/organizer/events/${eventId}/ticket-options`)
        .then(r => r.json())
        .then(d => {
          if (d && Array.isArray(d.categories) && d.categories.length > 0) {
            setAvailableCategories(d.categories.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
          }
        })
        .catch(() => {});
    }
  }, [eventId]);

  function resetForm() {
    setFormName('');
    setFormCode('');
    setFormDiscountType('PERCENT');
    setFormDiscountValue(15);
    setFormScope('ALL');
    setFormCategoryId('');
    setFormQuota('');
    setFormMinQuantity('');
    setShowForm(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        type: activeTab,
        name: formName.trim(),
        code: activeTab === 'VOUCHER' ? formCode.trim().toUpperCase() : null,
        discountType: formDiscountType,
        discountValue: Number(formDiscountValue),
        scope: formScope,
        categoryId: formScope === 'CATEGORY' ? formCategoryId : null,
        categoryName: formScope === 'CATEGORY' ? availableCategories.find(c => c.id === formCategoryId)?.name : null,
        startDate: new Date(`${formStartDate}T00:00:00+07:00`).toISOString(),
        endDate: new Date(`${formEndDate}T23:59:59+07:00`).toISOString(),
        quota: formQuota ? Number(formQuota) : null,
        minQuantity: formMinQuantity ? Number(formMinQuantity) : null,
        status: 'ACTIVE'
      };

      const res = await fetch(`/api/organizer/events/${eventId}/promos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat promo.');

      setMessage(`Promo "${payload.name}" berhasil dibuat!`);
      resetForm();
      void loadPromos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat promo.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(promo: Promo) {
    setBusy(true);
    setMessage('');
    setError('');
    const newStatus = promo.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/promos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promo.id, status: newStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah status promo.');
      setMessage(`Status promo "${promo.name}" diubah menjadi ${newStatus === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}.`);
      void loadPromos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(promo: Promo) {
    if (!await confirmAction(`Promo ${promo.name} tidak dapat digunakan lagi. Harga pesanan sebelumnya tetap tersimpan.`,{title:'Hapus promo?',confirmLabel:'Hapus promo',destructive:true})) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/promos?promoId=${promo.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus promo.');
      setMessage(`Promo "${promo.name}" berhasil dihapus.`);
      void loadPromos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
    } finally {
      setBusy(false);
    }
  }

  const filteredPromos = promos.filter(p => p.type === activeTab);
  const autoCount = promos.filter(p => p.type === 'AUTOMATIC').length;
  const voucherCount = promos.filter(p => p.type === 'VOUCHER').length;

  return (
    <section className="manage-card" aria-labelledby="promos-heading">
      <div className="manage-heading">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag size={26} color="var(--purple)" />
            <h2 id="promos-heading">Diskon & Voucher Acara</h2>
          </div>
          <p>
            Atur diskon otomatis (misal: Early Bird, Flash Sale) atau buat kode voucher promo untuk pembeli.
          </p>
        </div>
        <button
          className="button button-small"
          type="button"
          onClick={() => setShowForm(!showForm)}
          disabled={busy}
        >
          <Plus size={16} />
          {showForm ? 'Tutup Formulir' : activeTab === 'AUTOMATIC' ? 'Buat Diskon Otomatis' : 'Buat Kode Voucher'}
        </button>
      </div>

      {message && (
        <p className="manage-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }} role="status">
          <CheckCircle2 size={18} />
          {message}
        </p>
      )}

      {error && (
        <p className="form-error" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }} role="alert">
          <ShieldAlert size={18} />
          {error}
        </p>
      )}

      {/* Sub Tabs: Diskon Otomatis vs Kode Voucher */}
      <div className="promo-tabs" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, borderBottom: '2px solid var(--ink)', paddingBottom: 12 }}>
        <button
          type="button"
          className={`chip ${activeTab === 'AUTOMATIC' ? 'active' : ''}`}
          onClick={() => { setActiveTab('AUTOMATIC'); setShowForm(false); }}
          style={{ fontSize: 14, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Percent size={16} />
          <strong>Diskon Otomatis</strong>
          <span style={{ background: 'var(--cream)', border: '1px solid var(--ink)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
            {autoCount}
          </span>
        </button>

        <button
          type="button"
          className={`chip ${activeTab === 'VOUCHER' ? 'active' : ''}`}
          onClick={() => { setActiveTab('VOUCHER'); setShowForm(false); }}
          style={{ fontSize: 14, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Ticket size={16} />
          <strong>Kode Voucher</strong>
          <span style={{ background: 'var(--cream)', border: '1px solid var(--ink)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>
            {voucherCount}
          </span>
        </button>
      </div>

      {/* Creation Form */}
      {showForm && (
        <ValidatedForm onSubmit={handleCreate} style={{ background: 'var(--purple-light)', border: '2px solid var(--ink)', borderRadius: 12, padding: 24, marginBottom: 28, boxShadow: '4px 5px 0 var(--ink)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="var(--purple)" />
            {activeTab === 'AUTOMATIC' ? 'Formulir Diskon Otomatis Baru' : 'Formulir Kode Voucher Baru'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {activeTab === 'VOUCHER' && (
              <FieldLabel>
                Kode Voucher (Harus Unik)
                <input
                  type="text"
                  placeholder="Contoh: HEMAT20K, VIPPROMO"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value.toUpperCase())}
                  required
                  maxLength={30}
                  disabled={busy}
                  style={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1 }}
                />
              </FieldLabel>
            )}

            <FieldLabel>
              Nama Promo
              <input
                type="text"
                placeholder={activeTab === 'AUTOMATIC' ? 'Contoh: Early Bird 20%, Flash Sale' : 'Contoh: Voucher Diskon Peluncuran'}
                value={formName}
                onChange={e => setFormName(e.target.value)}
                required
                maxLength={100}
                disabled={busy}
              />
            </FieldLabel>

            <FieldLabel>
              Tipe Potongan
              <select
                value={formDiscountType}
                onChange={e => setFormDiscountType(e.target.value as DiscountType)}
                disabled={busy}
              >
                <option value="PERCENT">Persentase (%)</option>
                <option value="NOMINAL">Nominal Tetap (Rp)</option>
              </select>
            </FieldLabel>

            <FieldLabel>
              Besar Potongan {formDiscountType === 'PERCENT' ? '(1 - 100%)' : '(Rupiah)'}
              <NumberInput
                type="number"
                min={1}
                max={formDiscountType === 'PERCENT' ? 100 : 10000000}
                value={formDiscountValue}
                onChange={e => setFormDiscountValue(Number(e.target.value))}
                required
                disabled={busy}
              />
            </FieldLabel>

            <FieldLabel>
              Berlaku Untuk
              <select
                value={formScope}
                onChange={e => setFormScope(e.target.value as PromoScope)}
                disabled={busy}
              >
                <option value="ALL">Semua Kategori Tiket</option>
                <option value="CATEGORY">Kategori Tiket Tertentu</option>
              </select>
            </FieldLabel>

            {formScope === 'CATEGORY' && (
              <FieldLabel>
                Pilih Kategori Tiket
                <select
                  value={formCategoryId}
                  onChange={e => setFormCategoryId(e.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">-- Pilih Kategori --</option>
                  {availableCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </FieldLabel>
            )}

            <FieldLabel>
              Tanggal Mulai (WIB)
              <input
                type="date"
                value={formStartDate}
                onChange={e => setFormStartDate(e.target.value)}
                required
                disabled={busy}
              />
            </FieldLabel>

            <FieldLabel>
              Tanggal Berakhir (WIB)
              <input
                type="date"
                min={formStartDate}
                value={formEndDate}
                onChange={e => setFormEndDate(e.target.value)}
                required
                disabled={busy}
              />
            </FieldLabel>

            <FieldLabel>
              Batas Kuota Pemakaian (Opsional)
              <input
                type="number"
                min={1}
                placeholder="Kosongkan jika tanpa batas"
                value={formQuota}
                onChange={e => setFormQuota(e.target.value)}
                disabled={busy}
              />
            </FieldLabel>

            <FieldLabel>
              Minimal Jumlah Tiket (Opsional)
              <input
                type="number"
                min={1}
                max={30}
                placeholder="Contoh: 3 untuk diskon beli min 3"
                value={formMinQuantity}
                onChange={e => setFormMinQuantity(e.target.value)}
                disabled={busy}
              />
            </FieldLabel>
          </div>

          <div className="action-group promo-form-actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="button button-light" onClick={resetForm} disabled={busy}>
              Batal
            </button>
            <button type="submit" className="button" disabled={busy}>
              {busy ? 'Menyimpan...' : 'Simpan Promo'}
            </button>
          </div>
        </ValidatedForm>
      )}

      {/* Rules Information Box */}
      <div style={{ background: 'var(--cream)', border: '1px solid var(--ink)', borderRadius: 8, padding: 14, marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
        <strong>Aturan Otomatis Sistem:</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>Jika ada beberapa promo yang memenuhi syarat, sistem secara cerdas memilih <strong>potongan terbesar</strong>.</li>
          <li>Diskon otomatis dan voucher <strong>tidak ditumpuk (tidak double promo)</strong>. Sistem otomatis memilih potongan yang paling menguntungkan pembeli.</li>
          <li>Harga pesanan terkunci selama masa reservasi 10 menit.</li>
        </ul>
      </div>

      {/* List of Promos */}
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Memuat daftar promo...</p>
      ) : filteredPromos.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', border: '1.5px dashed var(--ink)', borderRadius: 12, background: 'var(--cream)' }}>
          <AlertCircle size={32} color="var(--muted)" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontWeight: 600, margin: '0 0 6px' }}>
            Belum ada {activeTab === 'AUTOMATIC' ? 'diskon otomatis' : 'kode voucher'} untuk acara ini.
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            Klik tombol &ldquo;Buat {activeTab === 'AUTOMATIC' ? 'Diskon Otomatis' : 'Kode Voucher'}&rdquo; di atas untuk menambahkan penawaran baru.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredPromos.map(promo => {
            const isPercent = promo.discountType === 'PERCENT';
            const valueLabel = isPercent ? `${promo.discountValue}%` : rupiah(promo.discountValue);
            const now = Date.now();
            const start = Date.parse(promo.startDate);
            const end = Date.parse(promo.endDate);
            const isExpired = !Number.isNaN(end) && now > end;
            const isUpcoming = !Number.isNaN(start) && now < start;
            const isQuotaFull = promo.quota !== null && promo.quota !== undefined && promo.usedCount >= promo.quota;

            return (
              <div
                key={promo.id}
                style={{
                  border: '1.5px solid var(--ink)',
                  borderRadius: 12,
                  background: promo.status === 'ACTIVE' && !isExpired && !isQuotaFull ? '#fff' : '#f4f4f4',
                  boxShadow: '3px 4px 0 var(--ink)',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 14
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>{promo.name}</h4>
                      {promo.type === 'VOUCHER' && (
                        <span style={{ background: 'var(--yellow)', border: '1px solid var(--ink)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>
                          🎟️ {promo.code}
                        </span>
                      )}
                    </div>

                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        border: '1px solid var(--ink)',
                        background: promo.status !== 'ACTIVE'
                          ? '#e0e0e0'
                          : isExpired
                          ? '#ffd1d1'
                          : isQuotaFull
                          ? '#ffe5b4'
                          : isUpcoming
                          ? '#fff3b0'
                          : 'var(--mint)'
                      }}
                    >
                      {promo.status !== 'ACTIVE'
                        ? 'Nonaktif'
                        : isExpired
                        ? 'Berakhir'
                        : isQuotaFull
                        ? 'Kuota Habis'
                        : isUpcoming
                        ? 'Terjadwal'
                        : 'Aktif'}
                    </span>
                  </div>

                  <div style={{ background: 'var(--purple-light)', border: '1px solid var(--purple)', borderRadius: 8, padding: '8px 12px', margin: '10px 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>Potongan:</span>
                    <strong style={{ fontSize: 18, color: 'var(--purple)', fontWeight: 850 }}>
                      {valueLabel}
                    </strong>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {isPercent ? 'dari subtotal' : 'per tiket'}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} />
                      <span>
                        {new Date(promo.startDate).toLocaleDateString('id-ID')} s/d {new Date(promo.endDate).toLocaleDateString('id-ID')}
                      </span>
                    </div>

                    <div>
                      <strong>Cakupan:</strong> {promo.scope === 'ALL' ? 'Semua Kategori' : `Hanya ${promo.categoryName || 'Kategori terpilih'}`}
                    </div>

                    {promo.minQuantity && (
                      <div>
                        <strong>Syarat:</strong> Min. pembelian {promo.minQuantity} tiket
                      </div>
                    )}

                    <div>
                      <strong>Pemakaian:</strong> {promo.usedCount} {promo.quota ? `/ ${promo.quota} kuota` : 'tiket (tanpa batas kuota)'}
                    </div>
                  </div>
                </div>

                <div className="action-group promo-card-actions" style={{ justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <button
                    type="button"
                    className="button button-small"
                    style={{ background: promo.status === 'ACTIVE' ? 'var(--cream)' : 'var(--mint)', minHeight: 36, padding: '6px 12px', fontSize: 12 }}
                    disabled={busy}
                    onClick={() => void toggleStatus(promo)}
                  >
                    {promo.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>

                  <button
                    type="button"
                    className="button button-small"
                    style={{ background: '#fff0f0', borderColor: '#d32f2f', color: '#d32f2f', minHeight: 36, padding: '6px 12px', fontSize: 12 }}
                    disabled={busy}
                    onClick={() => void handleDelete(promo)}
                    data-icon-action="" title="Hapus promo" aria-label={`Hapus ${promo.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
