import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { searchAthletes } from '../lib/selectors';
import { canRemoveTag } from '../lib/tagRules';
import type { Actor } from '../lib/tagRules';
import type { Athlete, Photo, PhotoAthleteTags } from '../state/types';

interface LoupeProps {
  photos: Photo[];
  photoId: string;
  onClose: () => void;
  onNavigate: (photoId: string) => void;
  tags: PhotoAthleteTags;
  athletes: Athlete[];
  actor: Actor;
  onTag: (photoId: string, athleteId: string) => void;
  onUntag: (photoId: string, athleteId: string) => void;
}

const SWIPE_THRESHOLD_PX = 50;

function nameOf(athlete: Athlete | undefined): string {
  return athlete?.preferredName || athlete?.name || 'Unknown';
}

// "Full tagging mode" (full-screen photo) has its own tap-to-search flow —
// tapping anywhere on the photo (not the nav arrows, not an existing tag
// chip) opens an @-style search right there, so tagging a meet's worth of
// photos from a phone never needs the side "Tags" sheet. This never stores
// *where* on the photo was tapped — the tap is only the gesture that opens
// the search; the resulting tag applies to the whole photo, same data model
// (and server authorization — see tagRules.ts) as the grid/side-panel path.
const LoupeTagSearch: React.FC<{
  photoId: string;
  athletes: Athlete[];
  taggedAthleteIds: Set<string>;
  onTag: (athleteId: string) => void;
  onClose: () => void;
}> = ({ athletes, taggedAthleteIds, onTag, onClose }) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = searchAthletes(athletes, query)
    .filter((a) => !taggedAthleteIds.has(a.id))
    .slice(0, 8);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function choose(athleteId: string) {
    onTag(athleteId);
    setQuery('');
    setHighlighted(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = matches[highlighted];
      if (chosen) choose(chosen.id);
    }
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-xl border-t border-ink-border bg-ink shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-ink-border px-3 py-2">
        <span className="text-sm text-ink-muted">@</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tag someone…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-foreground outline-none placeholder:text-ink-muted"
        />
        <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink-foreground" aria-label="Done tagging">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 overflow-y-auto py-1">
        {matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>}
        {matches.map((athlete, i) => (
          <li key={athlete.id}>
            <button
              type="button"
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => choose(athlete.id)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                i === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40'
              }`}
            >
              <span>{nameOf(athlete)}</span>
              {athlete.grade && <span className="text-xs opacity-70">Gr {athlete.grade}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

// The spec's loupe prefetches the neighbors so Space/arrow stepping never
// shows a blank frame — here that just means rendering <img> for the
// adjacent photos off-screen so the browser has already decoded them.
export const Loupe: React.FC<LoupeProps> = ({ photos, photoId, onClose, onNavigate, tags, athletes, actor, onTag, onUntag }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const index = photos.findIndex((p) => p.id === photoId);
  const photo = photos[index];
  const prev = index > 0 ? photos[index - 1] : null;
  const next = index < photos.length - 1 ? photos[index + 1] : null;
  const touchStartX = useRef<number | null>(null);
  const athletesById = new Map(athletes.map((a) => [a.id, a]));
  const [keyboardInset, setKeyboardInset] = useState(0);

  // Tagging is per-photo — stepping to the next photo always lands back on
  // the plain view, not mid-search for whichever athlete was being typed
  // for the last one.
  useEffect(() => {
    setSearchOpen(false);
  }, [photoId]);

  // On a phone, focusing the @-search input (LoupeTagSearch) pops the
  // on-screen keyboard, which eats the bottom of the visual viewport —
  // visualViewport shrinks, but the layout viewport (and this fixed
  // inset-0 overlay) doesn't, so the photo and search box can end up
  // sitting half under the keyboard. Shifting the content up by half of
  // whatever height the keyboard took re-centers it in the space that's
  // actually still visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset);
    }
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (searchOpen) return; // the search box owns Escape/arrows while open
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id);
      if (e.key === 'ArrowRight' && next) onNavigate(next.id);
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate, onClose, searchOpen]);

  if (!photo) return null;

  const entries = tags[photo.id] ?? [];
  const taggedAthleteIds = new Set(entries.map((e) => e.athleteId));

  // The phone layout promises "swipe between photos in the loupe" — a
  // plain left/right drag distance is enough here, no gesture library.
  function handleTouchStart(e: React.TouchEvent) {
    if (searchOpen) return;
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta > 0 && prev) onNavigate(prev.id);
    else if (delta < 0 && next) onNavigate(next.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
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

      {prev && !searchOpen && (
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
      {next && !searchOpen && (
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

      <div
        className="relative flex max-h-[85vh] max-w-[90vw] flex-col items-center transition-transform duration-150 ease-out"
        style={keyboardInset > 0 ? { transform: `translateY(-${keyboardInset / 2}px)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tapping the photo itself is the "tap an area to tag" gesture —
            no position is read off the tap, it's only what opens search. */}
        <img
          src={photo.webUrl}
          alt=""
          onClick={() => setSearchOpen(true)}
          className="max-h-[70vh] max-w-full cursor-pointer rounded-lg object-contain shadow-2xl"
        />

        <div className="relative mt-3 flex w-full max-w-md flex-wrap items-center justify-center gap-1.5">
          {entries.map((entry) => {
            const athlete = athletesById.get(entry.athleteId);
            const removable = canRemoveTag(actor, entry);
            return (
              <span
                key={entry.athleteId}
                className="flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-xs text-ink-foreground ring-1 ring-ink-border"
              >
                {nameOf(athlete)}
                {removable && (
                  <button
                    type="button"
                    onClick={() => onUntag(photo.id, entry.athleteId)}
                    aria-label={`Remove ${nameOf(athlete)}`}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
          >
            <Plus className="h-3 w-3" /> Tag
          </button>

          {searchOpen && (
            <LoupeTagSearch
              photoId={photo.id}
              athletes={athletes}
              taggedAthleteIds={taggedAthleteIds}
              onTag={(athleteId) => onTag(photo.id, athleteId)}
              onClose={() => setSearchOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Prefetch the neighbors so stepping never shows a blank frame. */}
      <div className="hidden">
        {prev && <img src={prev.webUrl} alt="" />}
        {next && <img src={next.webUrl} alt="" />}
      </div>
    </div>
  );
};
