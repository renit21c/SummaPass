'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import './scroll-reveal.css';

export function ScrollReveal({ children, className = '', delay = 0, style, enabled = true, label }: {
  children: ReactNode; className?: string; delay?: number; style?: CSSProperties; enabled?: boolean; label?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const node = element.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!enabled || !node || motion.matches || !('IntersectionObserver' in window)) return;
    const bounds = node.getBoundingClientRect();
    // Content stays readable before hydration and when JavaScript is unavailable.
    if (bounds.top < window.innerHeight - 24 && bounds.bottom > 0) return;
    setWaiting(true);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setWaiting(false);
        observer.disconnect();
      }
    }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });
    observer.observe(node);
    const reduce = () => { if (motion.matches) { setWaiting(false); observer.disconnect(); } };
    motion.addEventListener('change', reduce);
    return () => { observer.disconnect(); motion.removeEventListener('change', reduce); };
  }, [enabled]);
  return <div ref={element} className={`${enabled ? 'scroll-reveal' : ''} ${className}`} data-waiting={waiting || undefined} role={label ? 'group' : undefined} aria-label={label}
    style={{ ...style, '--reveal-delay': `${Math.min(delay, 240)}ms` } as CSSProperties}
    onFocusCapture={() => setWaiting(false)}>{children}</div>;
}
