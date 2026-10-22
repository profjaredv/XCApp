import React from 'react';
import type { PhotoGroup } from '../state/types';

interface GroupFilterSelectProps {
  groups: PhotoGroup[];
  value: string | null;
  onChange: (groupId: string | null) => void;
}

// Shared by the Tag and Build left panels (coach view): narrows the roster
// shown — and, for Build, what "Generate all" and "Export by group" act
// on — to one training/captain/custom group. Renders nothing when the
// team has no groups set up yet, rather than an empty, useless dropdown.
export const GroupFilterSelect: React.FC<GroupFilterSelectProps> = ({ groups, value, onChange }) => {
  if (groups.length === 0) return null;
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground"
      aria-label="Filter by group"
    >
      <option value="">All groups</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
};
