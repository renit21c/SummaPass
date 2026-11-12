'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import { Armchair, ArrowRight, BatteryFull, Check, CheckCircle2, CreditCard, Signal, Ticket, Wifi } from 'lucide-react';
import './phone-hero.css';

const steps = [
  { title: 'Pilih event', description: 'Lihat detail, jadwal, dan pilihan tiket.', icon: Ticket },
  { title: 'Pilih kursi', description: 'Cek denah dan tentukan kursi pilihanmu.', icon: Armchair },
  { title: 'Periksa pesanan', description: 'Isi data peserta dan lanjutkan pembayaran.', icon: CreditCard },
  { title: 'Buka e-ticket', description: 'Tunjukkan QR saat masuk ke acara.', icon: CheckCircle2 },
];

export function PhoneHero() {
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [inView, setInView] = useState(true);
  const showcase = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    update(); preference.addEventListener('change', update);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? false), { threshold: 0.1 }) : null;
    if (showcase.current) observer?.observe(showcase.current);
    return () => { preference.removeEventListener('change', update); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    if (reduced || !inView) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setStep(value => (value + 1) % steps.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [reduced, inView]);
  const active = steps[step];
  const animate = !reduced && inView;

  return <div ref={showcase} className="phone-showcase" data-playing={animate || undefined} aria-label="Preview alur pemesanan SummaPass">
    <div className="phone-scene">
      <div className="phone-model">
        <i className="phone-volume" aria-hidden="true" /><i className="phone-power" aria-hidden="true" />
        <div className="phone-glass">
          <div className="phone-status" aria-hidden="true"><span>09.41</span><span><Signal size={12} /><Wifi size={12} /><BatteryFull size={16} /></span></div>
          <div className="phone-camera" aria-hidden="true" />
          <div className="phone-display">
            <div className="phone-pages" style={{ transform: `translateX(-${step * 100}%)` }}>
              <div className="phone-page phone-event-page" aria-hidden={step !== 0}>
                <Image src="/images/hero-phone/bandung-innovation-week-event.webp" alt="Screenshot halaman Bandung Innovation Week di SummaPass." fill unoptimized loading="eager" fetchPriority="high" sizes="280px" />
                <span className="phone-tap phone-tap-event" aria-hidden="true" />
              </div>
              <div className="phone-page phone-seats-page" aria-hidden={step !== 1}>
                <div className="phone-app-heading"><Ticket size={17} /><strong>SummaPass</strong></div>
                <div className="phone-mini-heading"><span>Pilih kursi</span><small>Bandung Innovation Week</small></div>
                <div className="phone-map-shot"><Image src="/images/hero-phone/bandung-innovation-week-seats.svg" alt="Screenshot denah SummaPass dengan kategori Front dan Regular serta legenda status kursi." width={520} height={570} unoptimized loading="eager" /></div>
                <div className="phone-seat-choice"><span><Check size={14} /> Front A1</span><strong>Rp125.000</strong></div>
                <div className="phone-preview-button" aria-hidden="true">Lihat ringkasan <ArrowRight size={15} /></div>
                <span className="phone-tap phone-tap-seat" aria-hidden="true" />
              </div>
              <div className="phone-page phone-order-page" aria-hidden={step !== 2}>
                <div className="phone-app-heading"><Ticket size={17} /><strong>SummaPass</strong></div>
                <div className="phone-order-content">
                  <h3>Ringkasan pesanan</h3>
                  <div className="phone-order-card">
                    <div className="phone-order-event"><span><Ticket size={21} /></span><div><strong>Bandung Innovation Week</strong><small>19 November 2026</small></div></div>
                    <dl className="phone-order-attendee"><div><dt>Nama peserta</dt><dd>Peserta Demo</dd></div><div><dt>Tiket</dt><dd>Front A1</dd></div></dl>
                    <div className="phone-order-prices"><p><span>Subtotal</span><span>Rp125.000</span></p><p><span>Biaya layanan</span><span>Rp0</span></p><div><span>Total</span><strong>Rp125.000</strong></div></div>
                  </div>
                  <p className="phone-order-ready"><CheckCircle2 size={13} /> Data peserta lengkap</p>
                  <div className="phone-preview-button" aria-hidden="true">Lanjut ke pembayaran <ArrowRight size={14} /></div>
                </div>
                <span className="phone-tap phone-tap-order" aria-hidden="true" />
              </div>
              <div className="phone-page phone-ticket-page" aria-hidden={step !== 3}>
                <div className="phone-app-heading"><Ticket size={17} /><strong>SummaPass</strong></div>
                <div className="phone-success"><CheckCircle2 size={30} /><strong>Tiket tersedia</strong><span>Siap ditunjukkan saat masuk.</span></div>
                <div className="phone-sample-ticket"><Ticket size={24} /><h3>Bandung Innovation Week</h3><p>19 November 2026<br/>Summarecon Mall Bandung</p><div className="phone-ticket-seat"><span>Front</span><strong>A1</strong></div><div className="phone-example-qr"><QRCodeSVG value="SUMMAPASS-PREVIEW-NOT-A-VALID-TICKET" size={112} marginSize={1} /></div><small>Contoh e-ticket</small></div>
              </div>
            </div>
          </div>
          <div className="phone-home-indicator" aria-hidden="true" />
        </div>
      </div>
      <div className="phone-step-note"><div className="phone-note-heading"><span className="phone-note-icon"><active.icon size={22} aria-hidden="true" /></span><strong>{active.title}</strong></div><p>{active.description}</p></div>
    </div>
  </div>;
}
