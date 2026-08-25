import { useState, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

// The group selector for Group Analytics. The first version was a single
// flat wrap of every group in the season — which was already multi-select
// (checkboxes, not radios, despite reading like radios at a glance), but
// laid out so that a team with a handful of training groups plus one
// custom group per coach ran to three or four wrapped rows of identical
// pills before any data was visible. This keeps the same selection model
// and fixes the organization:
//
// - Training groups and Captain/Custom groups are separated. They were
//   already computed separately by the caller and then rendered into one
//   undifferentiated row; the backend draws the same distinction (see
//   GET /groups/analytics: no explicit selection defaults to TRAINING only,
//   because captain/custom groups are leadership designations rather than
//   performance cohorts).
// - Per-section "All" — "show me just my training squads" and "just the
//   coaches' groups" are the two selections a coach actually wants, and
//   both were previously N individual clicks.
// - Search appears once the list is long enough to be worth scanning.
// - The whole panel collapses to a one-line summary, and is collapsed by
//   default past a threshold, so the selector can never push the actual
//   analytics off the screen.

export interface PickerGroup {
  id: string;
  name: string;
  gender: string | null;
}

const GENDER_LABEL: Record<string, string> = { M: 'Boys', F: 'Girls' };

// Past this many groups the flat list stops being scannable: search
// appears and the panel starts collapsed.
const CROWDED_AT = 8;

export const GroupPicker = ({
  trainingGroups,
  otherGroups,
  selectedIds,
  onChange,
}: {
  trainingGroups: PickerGroup[];
  otherGroups: PickerGroup[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  const total = trainingGroups.length + otherGroups.length;
  // null = "not explicitly toggled yet", so the default follows the data as
  // it loads instead of being frozen by a useState initializer that ran
  // when the list was still empty.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const open = openState ?? total <= CROWDED_AT;
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const shownTraining = useMemo(
    () => trainingGroups.filter((g) => g.name.toLowerCase().includes(needle)),
    [trainingGroups, needle]
  );
  const shownOther = useMemo(
    () => otherGroups.filter((g) => g.name.toLowerCase().includes(needle)),
    [otherGroups, needle]
  );

  const selected = new Set(selectedIds);
  const toggle = (id: string) =>
    onChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  // Section "All" is a toggle: if everything in the section is already on,
  // the same button turns the section off — otherwise you'd need "All" and
  // "None" side by side for every section.
  const setSection = (groups: PickerGroup[]) => {
    const ids = groups.map((g) => g.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    onChange(allOn ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
  };

  const sectionLabel = (groups: PickerGroup[]) =>
    groups.length > 0 && groups.every((g) => selected.has(g.id)) ? 'None' : 'All';

  const section = (title: string, groups: PickerGroup[]) =>
    groups.length === 0 ? null : (
      <div className="space-y-1.5">
        {/* Button sits next to its heading, not flung to the far edge of a
            wide container — at 1280px `justify-between` put "All" a full
            screen-width away from the section it acts on. */}
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title} <span className="tabular-nums">({groups.length})</span>
          </p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSection(groups)}>
            {sectionLabel(groups)}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <label
              key={g.id}
              className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-accent/50"
            >
              <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} />
              <span className="truncate">{g.name}</span>
              {g.gender && (
                <span className="shrink-0 text-xs text-muted-foreground">({GENDER_LABEL[g.gender] ?? g.gender})</span>
              )}
            </label>
          ))}
        </div>
      </div>
    );

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpenState(!open)}
          className="flex min-h-9 items-center gap-1.5 text-sm font-medium"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          Groups
          <span className="font-normal text-muted-foreground">
            · <span className="tabular-nums">{selectedIds.length}</span> of{' '}
            <span className="tabular-nums">{total}</span> selected
          </span>
        </button>
        {selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {total > CROWDED_AT && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter groups…"
                className="h-9 pl-8"
              />
            </div>
          )}
          {shownTraining.length === 0 && shownOther.length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">No groups match “{query}”.</p>
          ) : (
            // Capped and scrolled rather than unbounded: on a phone, 19
            // groups expanded is a ~2000px column that buries the analytics
            // under it. The search box stays outside the scroll area so
            // it's always reachable.
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {section('Training groups', shownTraining)}
              {section('Captain & custom', shownOther)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupPicker;
