import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Flag, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackService } from '@/api/trackService';
import { formatMeetDate } from '@/lib/trackFormat';
import { getApiErrorMessage } from '@/lib/apiError';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { Empty, TrackScreen } from './trackShared';

// Add a meet before it happens, so athletes can be entered and relays built.
const AddMeet: React.FC<{ year: number }> = ({ year }) => {
  const navigate = useNavigate();
  const teamPath = useTeamPath();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Add a meet
      </Button>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const meet = await trackService.createMeet({ name, date, season: year });
      navigate(teamPath(`/track/meet/${meet.id}`));
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not add that meet.'));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="Meet name" placeholder="Meet name" value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
        <Input aria-label="Meet date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <Button type="button" size="sm" onClick={save} disabled={busy || !name.trim() || !date}>
          Add to {year}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

const Meets: React.FC<{ year: number }> = ({ year }) => {
  const teamPath = useTeamPath();
  const { data, isLoading } = useQuery({ queryKey: ['track', 'meets', year], queryFn: () => trackService.getMeets(year) });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length) return <Empty>No meets for {year} yet.</Empty>;
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {data.map((m) => (
          <div key={m.id} className="flex items-baseline gap-3 px-4 py-3 text-sm">
            <span className="w-28 shrink-0 text-muted-foreground">{formatMeetDate(m.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              <Link to={teamPath(`/track/meet/${m.id}`)} className="hover:underline">
                {m.name}
              </Link>
            </span>
            <span className="shrink-0 text-muted-foreground">
              {m.resultCount} result{m.resultCount === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const TrackMeetsPage: React.FC = () => (
  <TrackScreen icon={Flag} title="Meets" description="This season's meets: the ones you have results for and the ones you are planning." showSeason>
    {({ year }) => (
      <div className="space-y-4">
        <AddMeet year={year} />
        <Meets year={year} />
      </div>
    )}
  </TrackScreen>
);

export default TrackMeetsPage;
