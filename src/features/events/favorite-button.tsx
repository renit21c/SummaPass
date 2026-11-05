'use client';
import { Heart } from 'lucide-react';
import { useFavorites } from './favorites';

export function FavoriteButton({ slug, title }: { slug: string; title: string }) {
  const { isFavorite, toggle } = useFavorites();
  const favorited = isFavorite(slug);

  return (
    <button
      type="button"
      onClick={() => toggle(slug)}
      aria-label={favorited ? `Hapus ${title} dari favorit` : `Tambahkan ${title} ke favorit`}
      aria-pressed={favorited}
      className={`chip ${favorited ? 'active' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        background: favorited ? 'var(--pink)' : '#fff',
        color: 'var(--ink)',
        boxShadow: favorited ? '2px 2px 0 var(--ink)' : 'none',
        cursor: 'pointer'
      }}
    >
      <Heart size={18} fill={favorited ? 'currentColor' : 'none'} />
      <span>{favorited ? 'Tersimpan di Favorit' : 'Simpan ke Favorit'}</span>
    </button>
  );
}

