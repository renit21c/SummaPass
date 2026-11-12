'use client';
import { CopyReference } from '@/components/copy-reference';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, MapPin, Ticket as TicketIcon, Printer, Download, LoaderCircle, Mail, CheckCircle, Send, AlertCircle, RefreshCw, XCircle, UserCheck, MessageCircle } from 'lucide-react';
import type { Ticket } from './types';
import { dateLabel, rupiah, type Event } from '@/features/events/data';

export function TicketCard({ ticket: initialTicket, event }: { ticket: Ticket; event: Event }) {
  const [ticket, setTicket] = useState<Ticket>(initialTicket);
  const withoutSeats=ticket.seatLabel==='Tanpa nomor kursi';
  const [downloading, setDownloading] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showResendModal, setShowResendModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState('Berhalangan hadir karena keperluan mendadak');
  const [customReason, setCustomReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  // Transfer ticket states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newAttendeeName, setNewAttendeeName] = useState('');
  const [newAttendeeEmail, setNewAttendeeEmail] = useState('');
  const [transferReason, setTransferReason] = useState('Diberikan ke teman / keluarga');
  const [transferring, setTransferring] = useState(false);

  const requestKey = useRef<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleDownloadPdf() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/pdf`);
      if (!res.ok) throw new Error('Gagal mengunduh dokumen PDF.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SummaPass-Ticket-${ticket.reference}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setResendStatus({ type: 'error', message: 'PDF belum dapat diunduh. Coba lagi.' });
    } finally {
      setDownloading(false);
    }
  }

  async function handlePrintPdf() {
    if (printingPdf) return;
    setPrintingPdf(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/pdf`);
      if (!res.ok) throw new Error('Gagal memuat dokumen PDF untuk dicetak.');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      let printed = false;
      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        setPrintingPdf(false);
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(blobUrl, '_blank');
        }
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
          window.URL.revokeObjectURL(blobUrl);
        }, 60000);
      };

      iframe.onload = () => {
        setTimeout(triggerPrint, 300);
      };
      setTimeout(triggerPrint, 1500);
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal menyiapkan PDF untuk dicetak.'
      });
      setPrintingPdf(false);
    }
  }

  async function handleResendTicket(e: React.FormEvent) {
    e.preventDefault();
    if (resending || cooldown > 0) return;
    setResending(true);
    setResendStatus(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: requestKey.current ??= crypto.randomUUID() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal mengirim ulang tiket.');

      setResendStatus({
        type: 'success',
        message: data.message ?? 'Permintaan kirim ulang masuk antrean.'
      });
      setShowResendModal(false);
      setCooldown(60);
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengirim ulang tiket.'
      });
    } finally {
      setResending(false);
    }
  }

  async function handleRefund(e: React.FormEvent) {
    e.preventDefault();
    if (refunding) return;
    setRefunding(true);
    setResendStatus(null);
    const finalReason = refundReason === 'Lainnya' ? (customReason.trim() || 'Lainnya') : refundReason;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal membatalkan tiket.');

      if (data.ticket) {
        setTicket(data.ticket);
      } else {
        setTicket(prev => ({
          ...prev,
          status: 'REVOKED',
          cancellationReason: finalReason,
          refundAmount: prev.price,
          refundStatus: 'REFUNDED',
          cancelledAt: new Date().toISOString()
        }));
      }

      setResendStatus({
        type: 'success',
        message: `Tiket ${ticket.reference} berhasil dibatalkan. Pengembalian dana simulasi sebesar ${rupiah(data.refundAmount ?? ticket.price)} telah diproses dan kuota tiket telah kembali tersedia.`
      });
      setShowRefundModal(false);
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal membatalkan tiket.'
      });
    } finally {
      setRefunding(false);
    }
  }

  async function handleTransferTicket(e: React.FormEvent) {
    e.preventDefault();
    if (transferring) return;
    const cleanName = newAttendeeName.trim();
    if (!cleanName || cleanName.length < 2) {
      setResendStatus({ type: 'error', message: 'Nama peserta baru minimal 2 karakter.' });
      return;
    }
    setTransferring(true);
    setResendStatus(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeName: cleanName,
          attendeeEmail: newAttendeeEmail.trim() || undefined,
          reason: transferReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal mengalihkan tiket.');

      if (data.ticket) {
        setTicket(data.ticket);
      } else {
        setTicket(prev => ({
          ...prev,
          attendeeName: cleanName,
          previousAttendeeName: prev.attendeeName,
          attendeeEmail: newAttendeeEmail.trim() || undefined,
          transferredAt: new Date().toISOString()
        }));
      }

      setResendStatus({
        type: 'success',
        message: `Tiket ${ticket.reference} berhasil dialihkan kepada ${cleanName}. Kode QR e-ticket telah diperbarui secara aman.`
      });
      setShowTransferModal(false);
      setNewAttendeeName('');
      setNewAttendeeEmail('');
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengalihkan tiket.'
      });
    } finally {
      setTransferring(false);
    }
  }

  async function generateQrImageFile(token: string, reference: string): Promise<File> {
    try {
      const QRCode = (await import('qrcode')).default;
      const dataUrl = await QRCode.toDataURL(token, { width: 600, margin: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return new File([blob], `SummaPass-QR-${reference}.png`, { type: 'image/png' });
    } catch {
      const svg = document.querySelector('.ticket-qr svg') as SVGElement | null;
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        return new Promise<File>((resolve, reject) => {
          img.onload = () => {
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, 600, 600);
              ctx.drawImage(img, 50, 50, 500, 500);
            }
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
              if (blob) resolve(new File([blob], `SummaPass-QR-${reference}.png`, { type: 'image/png' }));
              else reject(new Error('Canvas to blob failed'));
            }, 'image/png');
          };
          img.onerror = () => reject(new Error('Image load failed'));
          img.src = url;
        });
      }
      throw new Error('QR code element not found');
    }
  }

  async function handleShareWhatsApp() {
    const lines = [
      'Halo! Ini rincian e-ticket SummaPass saya:',
      '',
      `*${event.title}*`,
      `- Tanggal: ${dateLabel(event.date)}`,
      `- Waktu: ${event.time}`,
      `- Lokasi: Summarecon Mall Bandung (${event.area ?? 'Venue Utama'})`,
      `- Kursi: *${ticket.seatLabel}* (${ticket.categoryName})`,
      `- Pemegang Tiket: *${ticket.attendeeName}*`,
      `- Kode Tiket: ${ticket.reference}`,
      '',
      'Tunjukkan kode QR e-ticket saat tiba di pintu masuk venue.'
    ];
    const text = lines.join('\n');

    // Cara 1: Web Share API (Khusus browser yang mendukung kirim file seperti di HP)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const file = await generateQrImageFile(ticket.token, ticket.reference);
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `E-Ticket ${event.title}`,
            text: text,
          });
          return;
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }

    // Fallback Desktop / Komputer: Salin gambar ke clipboard dan buka WhatsApp
    try {
      const file = await generateQrImageFile(ticket.token, ticket.reference);
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': file })
        ]);
        setResendStatus({
          type: 'success',
          message: 'Foto QR code telah disalin ke clipboard! Tekan Ctrl + V di chat WhatsApp untuk menempelkan foto.'
        });
      }
    } catch {
      // non-fatal
    }

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  const isCancelled = ticket.status === 'REVOKED';

  return (
    <div className="ticket-view">
      <article className="ticket-paper" aria-label={`E-ticket ${event.title}, ${ticket.seatLabel}`}>
        <div className={`ticket-content ticket-theme-${event.theme}`}>
          <TicketIcon size={32} />
          <h2>{event.title}</h2>
          <div className="ticket-status-row">
            <span
              style={
                isCancelled
                  ? { background: '#fff0ed', color: '#d92d20', borderColor: '#d92d20' }
                  : ticket.previousAttendeeName
                  ? { background: '#f3e8ff', color: 'var(--purple)', borderColor: 'var(--purple)' }
                  : {}
              }
            >
              {isCancelled
                ? 'Tiket dibatalkan (Refunded)'
                : ticket.previousAttendeeName
                ? `Dialihkan ke ${ticket.attendeeName}`
                : 'Tiket aktif'}
            </span>
            <span>
              {isCancelled
                ? 'Dana simulasi dikembalikan'
                : ticket.previousAttendeeName
                ? 'E-ticket telah diperbarui'
                : 'Pembayaran simulasi lunas'}
            </span>
          </div>

          {!isCancelled && ticket.previousAttendeeName && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: '#f3e8ff', border: '1.5px solid var(--purple)', borderRadius: 8 }}>
              <strong style={{ display: 'block', color: 'var(--purple)', fontSize: 13, marginBottom: 4 }}>
                Tiket Telah Dialihkan
              </strong>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>
                Pemegang tiket telah diubah dari <strong>{ticket.previousAttendeeName}</strong> ke <strong>{ticket.attendeeName}</strong>.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                QR code lama telah dirotasi dan dinonaktifkan demi keamanan. Silakan bagikan e-ticket terbaru ini ke {ticket.attendeeName}.
              </p>
            </div>
          )}

          {isCancelled && (
            <div style={{ marginTop: 14, padding: '12px 16px', background: '#fff0ed', border: '1.5px solid #d92d20', borderRadius: 8 }}>
              <strong style={{ display: 'block', color: '#d92d20', fontSize: 13, marginBottom: 4 }}>
                Tiket Dibatalkan &amp; Di-refund
              </strong>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>
                Alasan: {ticket.cancellationReason ?? 'Pengunjung berhalangan hadir'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Pengembalian dana simulasi sebesar {rupiah(ticket.refundAmount ?? ticket.price)} telah diproses. Kuota tiket kembali tersedia.
              </p>
            </div>
          )}

          <p className="ticket-fact" style={{ marginTop: isCancelled ? 14 : undefined }}>
            <CalendarDays size={17} />
            {dateLabel(event.date)} · {event.time}
          </p>
          <p className="ticket-fact">
            <MapPin size={17} />
            {event.area ?? 'Summarecon Mall Bandung'}
          </p>
          <div className="ticket-attendee">
            <span>Nama peserta</span>
            <strong>{ticket.attendeeName}</strong>
            {ticket.previousAttendeeName && (
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                (Dialihkan dari: {ticket.previousAttendeeName})
              </span>
            )}
          </div>
          <div className="ticket-seat-details">
            <div>
              <span>Kategori</span>
              <strong>{ticket.categoryName}{ticket.packageName?` · ${ticket.packageName}`:''}</strong>
            </div>
            <div>
              <span>{withoutSeats?'Penempatan':'Kursi'}</span>
              <strong>{ticket.seatLabel}</strong>
            </div>
          </div>
          <p className="ticket-price">Harga tiket {rupiah(ticket.price)}</p>
          <p className="ticket-demo-note">Tiket demo. Tidak berlaku untuk event nyata.</p>
        </div>

        <div className="ticket-qr-panel">
          {!isCancelled ? (
            <div className="ticket-qr">
              <QRCodeSVG
                value={ticket.token}
                size={240}
                marginSize={4}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
                title={`QR e-ticket ${ticket.reference}`}
              />
            </div>
          ) : (
            <div style={{ padding: '36px 16px', border: '2px dashed #d92d20', borderRadius: 12, background: '#fff8f6', maxWidth: 240, textAlign: 'center' }}>
              <strong style={{ display: 'block', fontSize: 13, color: '#d92d20', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tiket Tidak Aktif
              </strong>
              <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
                Tiket telah dibatalkan dan kuota tiket kembali tersedia.
              </p>
            </div>
          )}
          <div className="ticket-reference reference-with-copy"><span>{ticket.reference}</span><span className="no-print"><CopyReference value={ticket.reference} label="Salin nomor tiket"/></span></div>
          <div className="ticket-checkin-note">
            {isCancelled
              ? 'Status: Dibatalkan & Refunded (QR tidak berlaku di gerbang)'
              : ticket.checkedInAt
              ? `Sudah masuk: ${new Date(ticket.checkedInAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`
              : 'Belum check-in. Tunjukkan QR ini kepada petugas pintu masuk.'}
          </div>
        </div>
      </article>

      {/* Resend Status Banner */}
      {resendStatus && (
        <div
          role="status"
          className="ticket-email-input"
          style={{
            maxWidth: 980,
            margin: '20px auto 0',
            padding: 16,
            borderRadius: 10,
            border: '1.5px solid var(--ink)',
            background: resendStatus.type === 'success' ? 'var(--mint)' : '#fff0ed',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}
        >
          {resendStatus.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontSize: 13, fontWeight: 700 }}>{resendStatus.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="ticket-actions no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        <button
          className="button button-light"
          type="button"
          disabled={printingPdf}
          onClick={() => void handlePrintPdf()}
        >
          <Printer size={18} /> {printingPdf ? 'Menyiapkan Cetak PDF...' : 'Cetak E-Ticket'}
        </button>

        {!isCancelled && !ticket.checkedInAt && (
          <>
            <button
              className="button button-light"
              style={{ borderColor: 'var(--purple)', color: 'var(--purple)', fontWeight: 800 }}
              type="button"
              onClick={() => {
                setNewAttendeeName('');
                setNewAttendeeEmail('');
                setShowTransferModal(true);
              }}
            >
              <UserCheck size={18} /> Transfer / Ganti Nama
            </button>
            <button
              className="button button-light"
              style={{ borderColor: '#25D366', color: '#128C7E', fontWeight: 800 }}
              type="button"
              onClick={handleShareWhatsApp}
              title="Bagikan e-ticket ke WhatsApp"
            >
              <MessageCircle size={18} /> Kirim ke WhatsApp
            </button>
            <button
              className="button button-light"
              style={{ borderColor: 'var(--ink)', color: '#d92d20' }}
              type="button"
              onClick={() => setShowRefundModal(true)}
            >
              <XCircle size={18} /> Batalkan &amp; Refund Tiket
            </button>
          </>
        )}

        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
          Unduh PDF, cetak tiket, atau kirim PDF melalui email akun pemesan.
        </p>
      </div>

      <div className="ticket-actions no-print">
        <button data-icon-action="" aria-label={downloading?'Menyiapkan PDF tiket':'Unduh PDF tiket'} title={downloading?'Menyiapkan PDF tiket':'Unduh PDF tiket'} aria-busy={downloading} className="button button-light" type="button" disabled={downloading} onClick={() => void handleDownloadPdf()}>{downloading?<LoaderCircle size={20} className="spin" aria-hidden="true"/>:<Download size={20} aria-hidden="true"/>}</button>
        {!isCancelled && (
          <button className="button button-light" type="button" disabled={resending || cooldown > 0} onClick={() => { requestKey.current = crypto.randomUUID(); setShowResendModal(true); }}>
            <Mail size={18} />
            {cooldown > 0 ? `Tunggu ${cooldown} detik` : 'Email e-ticket PDF'}
          </button>
        )}
      </div>

      {/* Refund Ticket Dialog */}
      {showRefundModal && (
        <div
          role="dialog"
          aria-labelledby="refund-modal-title"
          style={{
            maxWidth: 980,
            margin: '20px auto 0',
            padding: 24,
            border: '2px solid var(--ink)',
            borderRadius: 12,
            background: 'var(--cream)',
            boxShadow: '6px 6px 0 var(--ink)'
          }}
        >
          <h3 id="refund-modal-title" style={{ fontSize: 20, margin: '0 0 8px', fontWeight: 800, color: '#d92d20' }}>
            Batalkan Tiket &amp; Pengembalian Dana
          </h3>
          <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
            Pembatalan tiket akan menonaktifkan kode QR e-ticket ini secara permanen. Tiket <strong>{ticket.categoryName}{ticket.packageName?` · ${ticket.packageName}`:''}</strong> akan kembali tersedia untuk pengunjung lain.
          </p>

          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--ink)', borderRadius: 8, padding: '14px 18px', marginBottom: 18, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Harga Pembelian Tiket</span>
              <strong>{rupiah(ticket.price)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>Biaya Layanan Pembatalan</span>
              <strong style={{ color: '#0d7d4d' }}>Rp0 (Gratis)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--ink)', paddingTop: 8, marginTop: 8 }}>
              <span>Estimasi Dana Dikembalikan</span>
              <strong style={{ color: 'var(--orange)', fontSize: 15 }}>{rupiah(ticket.price)}</strong>
            </div>
          </div>

          <form onSubmit={handleRefund}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Alasan Pembatalan:
              <select
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '10px 12px', marginTop: 4, borderRadius: 8, border: '1.5px solid var(--ink)', background: '#fff' }}
              >
                <option value="Berhalangan hadir karena keperluan mendadak">Berhalangan hadir karena keperluan mendadak</option>
                <option value="Perubahan jadwal acara atau rencana perjalanan">Perubahan jadwal acara atau rencana perjalanan</option>
                <option value="Salah memilih kursi atau kategori tiket">Salah memilih kursi atau kategori tiket</option>
                <option value="Lainnya">Alasan Lainnya</option>
              </select>
            </label>

            {refundReason === 'Lainnya' && (
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '12px 0' }}>
                Tuliskan Alasan:
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  placeholder="Ceritakan alasan pembatalan tiket..."
                  style={{ display: 'block', width: '100%', padding: '10px 12px', marginTop: 4, borderRadius: 8, border: '1.5px solid var(--ink)', minHeight: 70 }}
                />
              </label>
            )}

            <div className="action-group ticket-dialog-actions" style={{ marginTop: 18 }}>
              <button
                className="button"
                style={{ background: '#d92d20', color: '#fff', borderColor: 'var(--ink)' }}
                type="submit"
                disabled={refunding}
              >
                {refunding ? 'Memproses Pengembalian...' : 'Konfirmasi Batalkan & Refund'}
              </button>
              <button
                className="button button-light"
                type="button"
                disabled={refunding}
                onClick={() => setShowRefundModal(false)}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer Ticket Dialog */}
      {showTransferModal && (
        <div
          role="dialog"
          aria-labelledby="transfer-modal-title"
          style={{
            maxWidth: 980,
            margin: '20px auto 0',
            padding: 24,
            border: '2px solid var(--ink)',
            borderRadius: 12,
            background: 'var(--cream)',
            boxShadow: '6px 6px 0 var(--ink)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <UserCheck size={24} style={{ color: 'var(--purple)' }} />
            <h3 id="transfer-modal-title" style={{ fontSize: 20, margin: 0, fontWeight: 800, color: 'var(--ink)' }}>
              Transfer Tiket / Ubah Identitas Peserta
            </h3>
          </div>
          <p style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
            Alihkan e-ticket ini kepada teman atau anggota keluarga. Kode QR e-ticket akan diperbarui dengan tanda tangan kriptografis baru dan nama baru akan tercatat di gerbang masuk.
          </p>

          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--ink)', borderRadius: 8, padding: '14px 18px', marginBottom: 18, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>{withoutSeats?'Penempatan':'Kursi Terpilih'}</span>
              <strong>{ticket.seatLabel} ({ticket.categoryName})</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Nama Peserta Saat Ini</span>
              <strong style={{ color: 'var(--muted)' }}>{ticket.attendeeName}</strong>
            </div>
          </div>

          <form onSubmit={handleTransferTicket}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              <span>Nama Peserta Baru <span className="required-mark" aria-hidden="true">*</span></span>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={newAttendeeName}
                onChange={e => setNewAttendeeName(e.target.value)}
                placeholder="Contoh: Siti Nurhaliza"
                style={{ display: 'block', width: '100%', padding: '10px 12px', marginTop: 4, borderRadius: 8, border: '1.5px solid var(--ink)', background: '#fff' }}
              />
            </label>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Email Peserta Baru (Opsional):
              <input
                type="email"
                value={newAttendeeEmail}
                onChange={e => setNewAttendeeEmail(e.target.value)}
                placeholder="Contoh: siti@example.com"
                style={{ display: 'block', width: '100%', padding: '10px 12px', marginTop: 4, borderRadius: 8, border: '1.5px solid var(--ink)', background: '#fff' }}
              />
            </label>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 16 }}>
              Alasan Pengalihan:
              <select
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                style={{ display: 'block', width: '100%', padding: '10px 12px', marginTop: 4, borderRadius: 8, border: '1.5px solid var(--ink)', background: '#fff' }}
              >
                <option value="Diberikan ke teman / keluarga">Diberikan ke teman / keluarga</option>
                <option value="Koreksi salah ketik nama peserta">Koreksi salah ketik nama peserta</option>
                <option value="Berhalangan hadir dan dialihkan">Berhalangan hadir dan dialihkan</option>
                <option value="Lainnya">Alasan Lainnya</option>
              </select>
            </label>

            <div style={{ background: '#f8f8fb', border: '1px dashed var(--purple)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'var(--ink)' }}>
              <strong>Keamanan Tiket:</strong> Token QR lama akan otomatis tidak berlaku. Tiket baru hanya dapat divalidasi oleh petugas melalui QR kode terbaru.
            </div>

            <div className="action-group ticket-dialog-actions">
              <button
                className="button"
                style={{ background: 'var(--purple)', color: '#fff', borderColor: 'var(--ink)' }}
                type="submit"
                disabled={transferring}
              >
                {transferring ? 'Memproses Pengalihan...' : 'Konfirmasi Transfer Tiket'}
              </button>
              <button
                className="button button-light"
                type="button"
                disabled={transferring}
                onClick={() => setShowTransferModal(false)}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resend Ticket Dialog */}
      {showResendModal && (
        <div
          style={{
            maxWidth: 980,
            margin: '20px auto 0',
            padding: 24,
            border: '2px solid var(--ink)',
            borderRadius: 12,
            background: 'var(--yellow)',
            boxShadow: '4px 4px 0 var(--ink)'
          }}
        >
          <h3 style={{ fontSize: 18, margin: '0 0 6px', fontWeight: 800 }}>Kirim ulang e-ticket PDF</h3>
          <p style={{ fontSize: 13, margin: '0 0 16px' }}>
            PDF siap cetak dan tautan tiket dikirim ke email akun pemesan.
          </p>

          <form className="action-group ticket-dialog-actions" onSubmit={handleResendTicket}>
            <button className="button button-dark" type="submit" disabled={resending || cooldown > 0}>
              <Send size={16} />
              {resending ? 'Memproses...' : 'Minta kirim ulang'}
            </button>
            <button className="button button-light" type="button" onClick={() => setShowResendModal(false)}>
              Batal
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
