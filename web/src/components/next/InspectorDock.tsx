import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

// The desktop third panel (an inspector beside a list). Docked, it sits to
// the right of the page and can be resized by dragging its left edge (or
// with the arrow keys on that edge); the width is remembered per browser.
// Expanded, the same content opens as a wide slide-over above the page.
// The content decides where its expand/collapse button goes; it receives
// the current mode and a toggle.

const WIDTH_KEY = 'xc_next_inspector_width';
const MIN = 360;
const DEFAULT = 420;
// Leave the list at least this much room beside a docked panel.
const LIST_MIN = 520;

function maxWidth(): number {
  return Math.max(MIN, Math.min(960, window.innerWidth - LIST_MIN - 240));
}

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(v) && v >= MIN ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export interface InspectorControls {
  expanded: boolean;
  toggleExpanded: () => void;
}

export const InspectorDock: React.FC<{
  /** Names the slide-over for screen readers. */
  label: string;
  children: (controls: InspectorControls) => React.ReactNode;
}> = ({ label, children }) => {
  const [width, setWidth] = useState(() => Math.min(readWidth(), maxWidth()));
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const commit = useCallback((w: number) => {
    const clamped = Math.round(Math.min(maxWidth(), Math.max(MIN, w)));
    setWidth(clamped);
    try {
      localStorage.setItem(WIDTH_KEY, String(clamped));
    } catch {
      /* a private window: the width just isn't remembered */
    }
  }, []);

  useEffect(() => {
    const onResize = () => setWidth((w) => Math.min(w, maxWidth()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startW: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Dragging the left edge leftward widens the panel.
    commit(drag.current.startW + (drag.current.startX - e.clientX));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') commit(width + 32);
    else if (e.key === 'ArrowRight') commit(width - 32);
    else if (e.key === 'Home') commit(MIN);
    else if (e.key === 'End') commit(maxWidth());
    else return;
    e.preventDefault();
  };

  const controls: InspectorControls = { expanded, toggleExpanded: () => setExpanded((v) => !v) };

  return (
    <>
      <aside
        style={{ width }}
        className={cn(
          'sticky top-0 h-[calc(100dvh-8rem)] shrink-0 rounded-3xl bg-card shadow-sm ring-1 ring-border/60',
          expanded && 'invisible'
        )}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuemin={MIN}
          aria-valuemax={maxWidth()}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onDoubleClick={() => commit(DEFAULT)}
          title="Drag to resize · double-click to reset"
          className="group absolute -left-3 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center focus-visible:outline-none"
        >
          <span className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
        </div>
        <div className="h-full overflow-hidden rounded-3xl">{!expanded && children(controls)}</div>
      </aside>

      <DialogPrimitive.Root open={expanded} onOpenChange={setExpanded}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(960px,92vw)] flex-col rounded-l-3xl bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          >
            <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
            <div className="min-h-0 flex-1">{expanded && children(controls)}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
};
