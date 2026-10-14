import React, { useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGroupScope } from '@/contexts/GroupScopeContext';
import type { GroupType } from '@/api/groupService';
import { Sheet, SheetContent, SheetRow } from './Sheet';

const SECTION_LABEL: Partial<Record<GroupType, string>> = {
  TRAINING: 'Training groups',
  CAPTAIN: 'Captain groups',
  CUSTOM: 'Other',
};

// The group scope chip (§3.3). Coaches only, and only on pages that
// respect it — the shell decides that and simply doesn't render this
// otherwise.
export const GroupScopePicker: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const scope = useGroupScope();
  const [open, setOpen] = useState(false);
  if (!scope.enabled) return null;

  const pick = (value: string) => {
    scope.setScope(value);
    setOpen(false);
  };
  const sections = (['TRAINING', 'CAPTAIN', 'CUSTOM'] as GroupType[])
    .map((type) => ({ type, groups: scope.options.filter((g) => g.type === type) }))
    .filter((s) => s.groups.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Group scope: ${scope.label}`}
        className={cn(
          'flex h-12 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-accent',
          scope.scope !== 'all' && 'text-primary'
        )}
      >
        <Users className="h-4 w-4 shrink-0" />
        <span className={cn('truncate', compact ? 'max-w-[6.5rem]' : 'max-w-[12rem]')}>{scope.label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Show athletes from">
          {scope.isVolunteer ? (
            <SheetRow selected={scope.scope === 'mine'} onClick={() => pick('mine')}>
              My groups
            </SheetRow>
          ) : (
            <SheetRow selected={scope.scope === 'all'} onClick={() => pick('all')}>
              All athletes
            </SheetRow>
          )}
          {sections.map((s) => (
            <div key={s.type} className="mt-2">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {SECTION_LABEL[s.type]}
              </p>
              {s.groups.map((g) => (
                <SheetRow key={g.id} selected={scope.scope === g.id} onClick={() => pick(g.id)}>
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.activeMemberCount}</span>
                </SheetRow>
              ))}
            </div>
          ))}
          {scope.options.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {scope.isVolunteer ? "You don't lead a group this season yet." : 'No groups this season yet.'}
            </p>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
