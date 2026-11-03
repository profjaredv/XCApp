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

// Deliberately higher than a typical swipe-to-scroll threshold — on a
// touch device this is the ONLY way to step between photos (see
// isTouchDevice below: the nav arrows don't render there at all), so it
// has to be a clear, intentional gesture, not something a stray drag
// while reaching for the tag search triggers by accident.
const SWIPE_THRESHOLD_PX = 80;

function nameOf(athlete: Athlete | undefined): string {
  return athlete?.preferredName || athlete?.name || 'Unknown';
}

/**
 * A touch-primary device (phone/tablet), not just a narrow window — the
 * right signal for "does this device even have a mouse pointer to click
 * a chevron with," which a viewport-width check can't tell apart from a
 * touch device. See the nav-arrow note below for why this matters.
 */
function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches,
  );
  useEffect(() => {
    const mql = window.matchMedia('(hover: none) and (pointer: coarse)');
    const update = () => setIsTouch(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return isTouch;
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
  // Empty-query shows nothing rather than the whole (alphabetical, so
  // basically arbitrary) roster — on a small phone, six-plus full-height
  // rows appearing the instant you tap "Tag" was most of the reported
  // "clunky" complaint: it pushed the photo down to a sliver before
  // you'd even typed anything. Typing is the whole point of an @-search;
  // browsing the full roster already has its own UI (the Tag module's
  // side panel).
  const matches = query.trim()
    ? searchAthletes(athletes, query)
        .filter((a) => !taggedAthleteIds.has(a.id))
        .slice(0, 6)
    : [];

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
    // In normal flow, not an absolute overlay — it used to anchor to the
    // bottom of this row and grow upward from there, which meant a long
    // enough matches list rose up and covered most of the photo above it.
    // The photo itself shrinks a bit while this is open (see the <img>'s
    // own className below) specifically to make room for this so the two
    // never overlap: you can always see the photo you're tagging, and
    // whether a tag you just picked actually landed.
    <div className="mt-2 flex w-full flex-col rounded-xl border border-ink-border bg-ink shadow-2xl">
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
          // Android/Chrome otherwise treats this as a candidate for its
          // own password/card/address autofill strip, which ate a chunk
          // of screen above the keyboard and wasn't suppressed by a plain
          // `autoComplete="off"` reliably on every build — name="search"
          // plus type="search" together are what actually stops it.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="loupe-tag-search"
          type="search"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink-foreground outline-none placeholder:text-ink-muted"
        />
        <button type="button" onClick={onClose} className="text-ink-muted hover:text-ink-foreground" aria-label="Done tagging">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-[28vh] overflow-y-auto py-1">
        {!query.trim() && <li className="px-3 py-2 text-sm text-ink-muted">Start typing a name…</li>}
        {query.trim() && matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>}
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
  const isTouchDevice = useIsTouchDevice();
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

  // Arrow-key stepping is still reserved while the @-search is open — the
  // input itself needs Left/Right for normal text-cursor movement, and
  // Up/Down for picking a match. Escape no longer closes the loupe at
  // all: only the X button does (see the close button below), so one
  // stray keypress mid-tag can't lose your place.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (searchOpen) return;
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev.id);
      if (e.key === 'ArrowRight' && next) onNavigate(next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate, searchOpen]);

  if (!photo) return null;

  const entries = tags[photo.id] ?? [];
  const taggedAthleteIds = new Set(entries.map((e) => e.athleteId));

  // The phone layout promises "swipe between photos in the loupe" — a
  // plain left/right drag distance is enough here, no gesture library.
  // Left active even while the @-search is open — the search panel sits
  // below the photo, not over it, so swiping the photo itself to move on
  // to the next one doesn't need to be closed first.
  function handleTouchStart(e: React.TouchEvent) {
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
    // No onClick here — the backdrop itself no longer closes the loupe.
    // Only the X button (below) does, so a stray tap while reaching for a
    // nav arrow or the tag search can't accidentally lose your place.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="relative flex max-h-[95vh] max-w-[96vw] flex-col items-center overflow-y-auto transition-transform duration-150 ease-out"
        style={keyboardInset > 0 ? { transform: `translateY(-${keyboardInset / 2}px)` } : undefined}
      >
        {/* The nav arrows live inside this wrapper, centered on the photo
            itself rather than the full screen — previously they stayed
            pinned to the screen's vertical center even as the photo
            shrank to make room for the @-search below it, so they could
            end up sitting over the search panel instead of the photo,
            and a tap meant for a match in the list could land on "next
            photo" instead (losing the in-progress tag). Anchoring to the
            photo's own box means they always move with it. */}
        <div className="relative">
          {/* Tapping the photo itself is the "tap an area to tag" gesture —
              no position is read off the tap, it's only what opens search.
              Shrinks while the @-search is open to leave guaranteed room
              below for it — see LoupeTagSearch's own comment on why that
              panel no longer overlaps the photo. */}
          <img
            src={photo.webUrl}
            alt=""
            onClick={() => setSearchOpen(true)}
            className={`max-w-full cursor-pointer rounded-lg object-contain shadow-2xl transition-[max-height] duration-150 ${
              searchOpen ? 'max-h-[65vh]' : 'max-h-[85vh]'
            }`}
          />
          {/* Mouse/trackpad devices only — on touch, swipe (handleTouchEnd
              above, with its deliberately firm SWIPE_THRESHOLD_PX) is the
              sole way to step between photos, so these arrows would just be
              one more small target competing with the tap-to-tag gesture
              and the @-search below for the same thumb. Available even
              while the @-search is open — tagging one photo after another
              shouldn't require closing the search first just to move on. */}
          {prev && !isTouchDevice && (
            <button
              type="button"
              onClick={() => onNavigate(prev.id)}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {next && !isTouchDevice && (
            <button
              type="button"
              onClick={() => onNavigate(next.id)}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/70 text-ink-foreground hover:bg-ink"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        <div className="flex w-full max-w-md flex-col items-center">
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
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
          </div>

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
