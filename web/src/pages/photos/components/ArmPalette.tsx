import React, { useEffect, useRef, useState } from 'react';
import { searchAthletes } from '../lib/selectors';
import type { Athlete } from '../state/types';

interface ArmPaletteProps {
  athletes: Athlete[];
  onArm: (athleteId: string) => void;
  onCancel: () => void;
}

// Opened by pressing T (spec: "Arm an athlete by clicking their name or
// pressing T and typing"). Not a modal dialog — it never blocks the rest
// of the workspace and closes the instant an athlete is chosen.
export const ArmPalette: React.FC<ArmPaletteProps> = ({ athletes, onArm, onCancel }) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = searchAthletes(athletes, query).slice(0, 8);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = matches[highlighted];
      if (chosen) onArm(chosen.id);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onCancel}>
      <div
        className="w-80 rounded-lg border border-ink-border bg-ink text-ink-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Arm an athlete…"
          className="w-full rounded-t-lg border-b border-ink-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-ink-muted"
        />
        <ul className="max-h-64 overflow-y-auto py-1">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No matches</li>}
          {matches.map((athlete, i) => (
            <li key={athlete.id}>
              <button
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => onArm(athlete.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                  i === highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-ink-border/40'
                }`}
              >
                <span>{athlete.preferredName || athlete.name}</span>
                {athlete.grade && <span className="text-xs opacity-70">Gr {athlete.grade}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
