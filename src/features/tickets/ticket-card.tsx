'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, MapPin, Ticket as TicketIcon, Printer, Download, Mail, CheckCircle, Send, AlertCircle, RefreshCw } from 'lucide-react';
import type { Ticket } from './types';
import { dateLabel, rupiah, type Event } from '@/features/events/data';

export function TicketCard({ ticket, event }: { ticket: Ticket; event: Event }) {
  const [downloading, setDownloading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showResendModal, setShowResendModal] = useState(false);
  const requestKey=useRef<string|null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(cooldown-1),1000);return()=>clearTimeout(timer);},[cooldown]);

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
      setResendStatus({type:'error',message:'PDF belum dapat diunduh. Coba lagi.'});
    } finally {
      setDownloading(false);
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
        body: JSON.stringify({ key: requestKey.current??=crypto.randomUUID() })
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

  return (
    <div className="ticket-view">
      <article className="ticket-paper" aria-label={`E-ticket ${event.title}, ${ticket.seatLabel}`}>
        <div className={`ticket-content ticket-theme-${event.theme}`}>
          <TicketIcon size={32} />
          <h2>{event.title}</h2>
          <div className="ticket-status-row">
            <span>{ticket.status === 'ACTIVE' ? 'Tiket aktif' : 'Tidak aktif'}</span>
            <span>Pembayaran simulasi lunas</span>
          </div>
          <p className="ticket-fact">
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
          </div>
          <div className="ticket-seat-details">
            <div>
              <span>Kategori</span>
              <strong>{ticket.categoryName}</strong>
            </div>
            <div>
              <span>Kursi</span>
              <strong>{ticket.seatLabel}</strong>
            </div>
          </div>
          <p className="ticket-price">Harga tiket {rupiah(ticket.price)}</p>
          <p className="ticket-demo-note">Tiket demo. Tidak berlaku untuk event nyata.</p>
        </div>

        <div className="ticket-qr-panel">
          {ticket.status === 'ACTIVE' ? (
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
            <p>Tiket ini sudah tidak aktif.</p>
          )}
          <p className="ticket-reference">{ticket.reference}</p>
          <div className="ticket-checkin-note">
            {ticket.checkedInAt
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
          onClick={() => window.print()}
        >
          <Printer size={18} /> Cetak E-Ticket
        </button>

        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
          Unduh PDF, cetak tiket, atau kirim PDF melalui email akun pemesan.
        </p>
      </div>

      <div className="ticket-actions no-print"><button className="button button-light" type="button" disabled={downloading} onClick={()=>void handleDownloadPdf()}><Download size={18}/>{downloading?'Menyiapkan PDF...':'Unduh PDF'}</button><button className="button button-light" type="button" disabled={resending||cooldown>0} onClick={()=>{requestKey.current=crypto.randomUUID();setShowResendModal(true);}}><Mail size={18}/>{cooldown>0?`Tunggu ${cooldown} detik`:'Email e-ticket PDF'}</button></div>
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

          <form onSubmit={handleResendTicket} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
