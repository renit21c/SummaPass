'use client';
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'summapass_favorites';

export function getFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

export function toggleFavorite(slug: string): boolean {
  if (typeof window === 'undefined') return false;
  const current = getFavorites();
  const next = current.includes(slug) ? current.filter(s => s !== slug) : [...current, slug];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('summapass_favorites_changed', { detail: next }));
  } catch {
    // Ignore storage quota errors
  }
  return next.includes(slug);
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
    const onStorage = (e: Event) => {
      if (e instanceof CustomEvent) {
        setFavorites(e.detail);
      } else {
        setFavorites(getFavorites());
      }
    };
    window.addEventListener('summapass_favorites_changed', onStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('summapass_favorites_changed', onStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    favorites,
    isFavorite: (slug: string) => favorites.includes(slug),
    toggle: (slug: string) => toggleFavorite(slug)
  };
}

