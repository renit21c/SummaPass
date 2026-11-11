'use client';

import { useEffect } from 'react';

/**
 * Ensures anchor links (e.g. href="#events") always smoothly scroll to the target element
 * even if the browser URL is already at that hash fragment.
 */
export function AnchorScrollHandler() {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href) return;

      const hashIndex = href.indexOf('#');
      if (hashIndex === -1) return;

      const hash = href.slice(hashIndex);
      if (hash === '#' || hash === '#!') return;

      const id = hash.slice(1);
      const element = document.getElementById(id);
      if (element) {
        e.preventDefault();
        element.scrollIntoView({ behavior: 'smooth' });
        if (window.location.hash !== hash) {
          window.history.pushState(null, '', hash);
        }
      }
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return null;
}

