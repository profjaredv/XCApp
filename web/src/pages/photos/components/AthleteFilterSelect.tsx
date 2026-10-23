import React from 'react';
import type { Athlete } from '../state/types';

interface AthleteFilterSelectProps {
  athletes: Athlete[];
  value: string | null;
  onChange: (athleteId: string | null) => void;
}

// The Tag left panel's "Filter by athlete" — narrows the grid/filmstrip
// to just this athlete's tagged photos (lib/selectors.ts's visiblePhotos),
// independent of arming. A plain <select> rather than a search box: the
// roster search just below already covers "find someone by typing," and a
// native <select> gets free keyboard-jump-to-letter on both desktop and
// mobile with no extra code.
export const AthleteFilterSelect: React.FC<AthleteFilterSelectProps> = ({ athletes, value, onChange }) => {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground"
      aria-label="Filter by athlete"
    >
      <option value="">All athletes</option>
      {athletes.map((a) => (
        <option key={a.id} value={a.id}>
          {a.preferredName || a.name}
        </option>
      ))}
    </select>
  );
};
