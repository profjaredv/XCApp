import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useOptionalSeasonSelection } from '@/contexts/SeasonContext';
import { Sheet, SheetContent, SheetRow } from './Sheet';

// The season picker as a chip ("2026 ▾") that opens a sheet — same shared
// SeasonContext classic's header Select writes, so the two shells always
// agree on the season.
export const SeasonChip: React.FC = () => {
  const selection = useOptionalSeasonSelection();
  const [open, setOpen] = useState(false);
  if (!selection || selection.seasons.length === 0) return null;
  const { seasons, activeYear, activeSeason, setSelectedYear } = selection;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Season ${activeYear ?? ''}`}
        className="flex h-12 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-accent"
      >
        {activeYear}
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Season">
          {seasons.map((s) => (
            <SheetRow
              key={s.year}
              selected={s.year === activeYear}
              onClick={() => {
                setSelectedYear(s.year);
                setOpen(false);
              }}
            >
              <span className="flex-1">{s.year}</span>
              {s.year === activeSeason && <span className="text-xs text-muted-foreground">Current</span>}
            </SheetRow>
          ))}
        </SheetContent>
      </Sheet>
    </>
  );
};
