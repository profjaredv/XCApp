import React, { useEffect, useRef, useState } from 'react';

// C6 (LeadPack Master Build Handoff): the input rule is exact — four
// digits, min:sec, nothing else. "0530" is 5:30; "1006" is 10:06 (the
// first two digits are always minutes, the last two always seconds, which
// handles both single- and double-digit minutes with the same four-digit
// buffer). Non-digit keystrokes are rejected outright, not accepted and
// cleaned. The fourth digit auto-advances; on an invalid seconds value it
// stays put with an inline flag instead, so the reviewer can backspace and
// fix it without losing their place in the column.

export type CellNavigate = 'up' | 'down' | 'left' | 'right';

interface SplitCellProps {
  cellKey: string;
  value: number | null; // elapsedSec, or null/undefined if blank
  disabled?: boolean;
  saveState?: 'idle' | 'queued' | 'saving' | 'saved' | 'error';
  registerRef: (key: string, el: HTMLInputElement | null) => void;
  onComplete: (key: string, elapsedSec: number) => void;
  onClear: (key: string) => void;
  onNavigate: (key: string, direction: CellNavigate) => void;
}

function digitsFromElapsedSec(sec: number | null | undefined): string {
  if (sec == null || sec < 0) return '';
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${String(mm).padStart(2, '0')}${String(ss).padStart(2, '0')}`.slice(-4).padStart(4, '0');
}

function formatDigits(digits: string): string {
  if (digits.length === 0) return '-:--';
  if (digits.length === 1) return `${digits}_:--`;
  if (digits.length === 2) return `${parseInt(digits, 10)}:--`;
  if (digits.length === 3) return `${parseInt(digits.slice(0, 2), 10)}:${digits[2]}_`;
  const mm = parseInt(digits.slice(0, 2), 10);
  return `${mm}:${digits.slice(2, 4)}`;
}

function secondsFromDigits(digits: string): number | null {
  if (digits.length !== 4) return null;
  const mm = parseInt(digits.slice(0, 2), 10);
  const ss = parseInt(digits.slice(2, 4), 10);
  if (ss > 59) return null;
  return mm * 60 + ss;
}

export const SplitCell: React.FC<SplitCellProps> = ({
  cellKey,
  value,
  disabled,
  saveState = 'idle',
  registerRef,
  onComplete,
  onClear,
  onNavigate,
}) => {
  const [digits, setDigits] = useState(() => digitsFromElapsedSec(value ?? null));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDigits(digitsFromElapsedSec(value ?? null));
      setInvalid(false);
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onNavigate(cellKey, e.shiftKey ? 'up' : 'down');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onNavigate(cellKey, 'up');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNavigate(cellKey, 'down');
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onNavigate(cellKey, 'left');
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onNavigate(cellKey, 'right');
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits.length === 0) {
        onNavigate(cellKey, 'up');
        return;
      }
      setDigits(digits.slice(0, -1));
      setInvalid(false);
      return;
    }
    if (e.key === 'Tab') {
      // Let Tab do nothing special — this grid is Enter/arrow-driven, not
      // a native tab-order form.
      return;
    }
    // Reject anything that isn't a single digit, including at 4 digits
    // already — do not accept and clean, do not accept.
    if (!/^[0-9]$/.test(e.key) || digits.length >= 4) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const next = digits + e.key;
    setDigits(next);

    if (next.length === 4) {
      const elapsedSec = secondsFromDigits(next);
      if (elapsedSec == null) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      onComplete(cellKey, elapsedSec);
      onNavigate(cellKey, 'down');
    }
  };

  return (
    <input
      ref={(el) => registerRef(cellKey, el)}
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={formatDigits(digits)}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (digits.length === 0) onClear(cellKey);
      }}
      onChange={() => {
        /* all mutation happens in onKeyDown — this just satisfies React's controlled-input requirement */
      }}
      className={`w-full text-center font-mono text-sm rounded-md border px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary ${
        invalid
          ? 'border-destructive bg-destructive/10 text-destructive'
          : saveState === 'error'
            ? 'border-destructive'
            : 'border-input bg-background'
      } ${saveState === 'saving' || saveState === 'queued' ? 'opacity-70' : ''}`}
      aria-invalid={invalid}
      aria-label={cellKey}
    />
  );
};

export default SplitCell;
