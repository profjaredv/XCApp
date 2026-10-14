import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalSeasonSelection } from '@/contexts/SeasonContext';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { rosterService } from '@/api/rosterService';
import { matchesQuery } from '@/lib/athleteSearch';
import { gradeLabelShort } from '@/lib/seasonUtils';
import { Sheet, SheetContent } from './Sheet';

// Find athlete (§3.4): coaches only, the whole roster, matched with the
// same lib/athleteSearch the pickers use. A pick opens the Athletes
// inspector on a wide screen and the athlete page everywhere else.
export const FindAthleteButton: React.FC = () => {
  const { currentUser } = useAuth();
  const isCoach = ['HEAD_COACH', 'COACH', 'VOLUNTEER_COACH'].includes(currentUser?.teamRole ?? '');
  const [open, setOpen] = useState(false);
  if (!isCoach) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Find athlete"
        title="Find athlete"
        className="flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium hover:bg-accent"
      >
        <Search className="h-5 w-5" />
        <span className="hidden xl:inline">Find athlete</span>
      </button>
      {open && <FindAthleteSheet onClose={() => setOpen(false)} />}
    </>
  );
};

const FindAthleteSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const season = useOptionalSeasonSelection()?.activeYear ?? undefined;
  const [query, setQuery] = useState('');
  const { data: roster = [], isLoading } = useQuery({
    queryKey: ['findAthleteRoster', season],
    queryFn: () => rosterService.getRoster(season, { activeOnly: true }),
  });

  const matches = useMemo(() => {
    const named = roster.map((a) => ({ ...a, display: a.preferredName || a.name }));
    return named
      .filter((a) => matchesQuery(`${a.display} ${a.name}`, query))
      .sort((a, b) => a.display.localeCompare(b.display))
      .slice(0, 50);
  }, [roster, query]);

  const pick = (id: string) => {
    onClose();
    if (window.matchMedia('(min-width: 1280px)').matches) navigate(teamPath(`/athletes?athlete=${id}`));
    else navigate(teamPath(`/athlete/${id}`));
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent title="Find athlete" className="lg:max-h-[70vh]">
        <div className="px-1 pb-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name"
            aria-label="Athlete name"
            className="h-12 text-base"
          />
        </div>
        {isLoading && <p className="px-3 py-4 text-sm text-muted-foreground">Loading the roster…</p>}
        {!isLoading && matches.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {roster.length === 0 ? 'Nobody is on this season’s roster yet.' : `No athlete matches “${query}”.`}
          </p>
        )}
        {matches.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a.id)}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.display}</span>
            {a.grade != null && <span className="text-xs text-muted-foreground">{gradeLabelShort(a.grade)}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </SheetContent>
    </Sheet>
  );
};
