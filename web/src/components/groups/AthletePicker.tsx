import React, { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { matchesQuery } from '@/lib/athleteSearch';

// Pick an athlete by typing their name.
//
// Replaces a plain <Select> whose only affordance on a ninety-athlete
// roster was scrolling a ninety-item list looking for one person. Built
// from an input and a list rather than a combobox component because the
// app has no Command/Popover primitive, and adding one for this would be a
// larger change than the problem warrants.
//
// Matching lives in lib/athleteSearch.ts — the groups board uses the same
// rule, and a helper exported from a component file breaks fast refresh.

export interface PickableAthlete {
  id: string;
  name: string;
  grade?: number | null;
}

export const AthletePicker: React.FC<{
  athletes: PickableAthlete[];
  onPick: (athleteId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Shown when the list itself is empty, as distinct from no match. */
  emptyLabel?: string;
}> = ({
  athletes,
  onPick,
  disabled,
  placeholder = 'Search athletes…',
  emptyLabel = 'Nobody left to add.',
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => athletes.filter((a) => matchesQuery(a.name, query)),
    [athletes, query]
  );

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || athletes.length === 0}
          className="pl-9"
          // Enter picks the only remaining match — the fast path once a
          // coach has typed enough to be unambiguous.
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length === 1) {
              e.preventDefault();
              pick(matches[0].id);
            }
          }}
        />
      </div>

      {athletes.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-52 overflow-y-auto rounded-md border">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No athlete matching “{query.trim()}”.
            </p>
          ) : (
            matches.map((athlete) => (
              <button
                key={athlete.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(athlete.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                  'border-b last:border-b-0 hover:bg-muted/60 disabled:opacity-50'
                )}
              >
                <span className="min-w-0 truncate">{athlete.name}</span>
                {athlete.grade != null && (
                  <span className="shrink-0 text-xs text-muted-foreground">Gr {athlete.grade}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AthletePicker;
