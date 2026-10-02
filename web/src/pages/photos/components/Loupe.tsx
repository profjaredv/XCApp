import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { placeholderWebUrl } from '../data/placeholderPhoto';
import type { Photo } from '../state/types';

interface LoupeProps {
  photos: Photo[];
  photoId: string;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
}

// The spec's loupe prefetches the neighbors so Space/arrow stepping never
// shows a blank frame — here that just means rendering <img> for the
// adjacent photos off-screen so the browser has already decoded them.
export const Loupe: React.FC<LoupeProps> = ({ photos, photoId, onClose, onNavigate }) => {
  const index = photos.findIndex((p) => p.id === photoId);
  const photo = photos[index];
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index < photos.length - 1 ? photos[index + 1] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id);
      if (e.key === 'ArrowRight' && next) onNavigate(next.id);
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {prev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(prev.id);
          }}
          className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
          aria-label="Previous photo"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(next.id);
          }}
          className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
          aria-label="Next photo"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <img
        src={placeholderWebUrl(photo.seed)}
        alt=""
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {/* Prefetch the neighbors so stepping never shows a blank frame. */}
      <div className="hidden">
        {prev && <img src={placeholderWebUrl(prev.seed)} alt="" />}
        {next && <img src={placeholderWebUrl(next.seed)} alt="" />}
      </div>
    </div>
  );
};
