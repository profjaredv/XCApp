import { useEffect, useMemo, useRef, useState } from 'react';

// A minimal row-based virtualizer: renders only the rows whose photos could
// be on screen (plus a small overscan), so a 2000-photo grid never mounts
// more than a couple hundred thumbnails regardless of how far someone has
// scrolled. No external dependency — the gap between thumbnails is fixed,
// so row height is just thumbSize + gap and columns is a simple divide.

interface Options {
  itemCount: number;
  thumbSize: number;
  gap: number;
  overscanRows?: number;
}

interface Result {
  containerRef: React.RefObject<HTMLDivElement | null>;
  columns: number;
  /** The actual per-thumbnail size to render — on a narrow (phone-width)
   *  container this is clamped so three columns always fit, regardless of
   *  the desktop zoom slider's `thumbSize`. */
  itemSize: number;
  rowHeight: number;
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  offsetY: number;
}

// Below this container width, the spec's "three-column grid" on phones
// takes priority over whatever the desktop zoom slider last had.
const PHONE_MIN_COLUMNS_WIDTH = 600;
const PHONE_COLUMNS = 3;

export function useVirtualizedGrid({ itemCount, thumbSize, gap, overscanRows = 3 }: Options): Result {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    setContainerHeight(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll);
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const isPhoneWidth = containerWidth > 0 && containerWidth < PHONE_MIN_COLUMNS_WIDTH;
  const itemSize = isPhoneWidth
    ? Math.max(60, Math.floor((containerWidth - gap * (PHONE_COLUMNS - 1)) / PHONE_COLUMNS))
    : thumbSize;
  const columns = Math.max(1, Math.floor((containerWidth + gap) / (itemSize + gap)));
  const rowHeight = itemSize + gap;
  const rowCount = Math.ceil(itemCount / columns);
  const totalHeight = rowCount * rowHeight;

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
  const visibleRowCount = Math.ceil(containerHeight / rowHeight) + overscanRows * 2;
  const lastVisibleRow = Math.min(rowCount, firstVisibleRow + visibleRowCount);

  const startIndex = firstVisibleRow * columns;
  const endIndex = Math.min(itemCount, lastVisibleRow * columns);
  const offsetY = firstVisibleRow * rowHeight;

  return useMemo(
    () => ({ containerRef, columns, itemSize, rowHeight, totalHeight, startIndex, endIndex, offsetY }),
    [columns, itemSize, rowHeight, totalHeight, startIndex, endIndex, offsetY],
  );
}
