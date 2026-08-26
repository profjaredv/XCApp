import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Copy, Download, Inbox, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { SegmentedPills } from '@/components/field/SegmentedPills';
import api from '@/api/api';

// The product owner's inbox: every report filed from the in-app feedback
// button, across every team, grouped by the screen it came from. Super-admin
// only — the backend enforces it (routes/feedback.js requireSuperAdmin), and
// this page reflects that rather than being the thing that enforces it.
//
// The point of the screen is the handoff: triage a little, then "Copy as
// markdown" and paste the whole organized queue into a chat with whoever is
// doing the work.

interface FeedbackItem {
  id: string;
  route: string;
  screen: string | null;
  season: number | null;
  severity: 'blocker' | 'bug' | 'polish' | 'idea';
  message: string;
  status: 'open' | 'triaged' | 'fixed' | 'wontfix';
  userEmail: string | null;
  teamName: string | null;
  notes: string | null;
  createdAt: string;
  context?: { consoleErrors?: string[]; viewport?: string | null } | null;
}

interface FeedbackResponse {
  feedback: FeedbackItem[];
  counts: Record<string, number>;
  severityCounts: Record<string, number>;
}

const SEVERITY_STYLES: Record<FeedbackItem['severity'], string> = {
  blocker: 'bg-destructive text-white border-destructive',
  bug: 'bg-amber-500 text-white border-amber-500',
  polish: 'bg-sky-500 text-white border-sky-500',
  idea: 'bg-muted text-muted-foreground',
};

const STATUSES = ['open', 'triaged', 'fixed', 'wontfix'] as const;
const SEVERITIES = ['blocker', 'bug', 'polish', 'idea'] as const;
const ALL = '__all__';

const FeedbackPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [severityFilter, setSeverityFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');

  const isSuperAdmin = !!currentUser?.isSuperAdmin;

  const { data, isLoading } = useQuery<FeedbackResponse>({
    queryKey: ['feedback', statusFilter, severityFilter],
    queryFn: async () => {
      const response = await api.get('/feedback', {
        params: {
          status: statusFilter,
          ...(severityFilter === ALL ? {} : { severity: severityFilter }),
        },
      });
      return response.data;
    },
    enabled: isSuperAdmin,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/feedback/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
    onError: () => toast.error('Could not update status'),
  });

  const fetchExport = async (all: boolean) => {
    const response = await api.get('/feedback/export', {
      responseType: 'text',
      ...(all ? { params: { status: 'all' } } : {}),
    });
    return String(response.data);
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(await fetchExport(false));
      toast.success('Copied as markdown — paste it straight into chat');
    } catch {
      toast.error('Could not copy export');
    }
  };

  const downloadExport = async () => {
    try {
      const text = await fetchExport(true);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `leadpack-feedback-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download export');
    }
  };

  const items = useMemo(() => data?.feedback ?? [], [data]);
  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((i) =>
            [i.message, i.screen, i.route, i.teamName, i.userEmail].some((f) => f?.toLowerCase().includes(needle))
          )
        : items,
    [items, needle]
  );

  const byScreen = useMemo(
    () =>
      filtered.reduce<Record<string, FeedbackItem[]>>((acc, item) => {
        (acc[item.screen || item.route] ||= []).push(item);
        return acc;
      }, {}),
    [filtered]
  );

  // The backend already refuses; this is so a non-admin who lands on the URL
  // gets an explanation rather than an endless spinner or a bare 403 toast.
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">This inbox isn't yours to read</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Feedback you send goes to the LeadPack maintainer. Use the Feedback button on any screen to file
            something — you'll get a confirmation when it lands.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Every report from every team, grouped by screen.
            {data?.severityCounts?.blocker ? (
              <>
                {' '}
                <span className="font-medium text-destructive">
                  {data.severityCounts.blocker} open blocker{data.severityCounts.blocker === 1 ? '' : 's'}.
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copyExport} className="h-10 sm:h-9">
            <Copy className="mr-2 h-4 w-4" />
            Copy as markdown
          </Button>
          <Button variant="outline" onClick={downloadExport} className="h-10 sm:h-9" title="Download everything, resolved included">
            <Download className="mr-2 h-4 w-4" />
            Download all
          </Button>
        </div>
      </div>

      <SegmentedPills
        caption="Status"
        value={statusFilter}
        onChange={setStatusFilter}
        segments={STATUSES.map((s) => ({ value: s, label: s, badge: data?.counts?.[s] ?? 0 }))}
      />
      <SegmentedPills
        caption="Kind"
        value={severityFilter}
        onChange={setSeverityFilter}
        segments={[
          { value: ALL, label: 'All' },
          ...SEVERITIES.map((s) => ({ value: s, label: s, badge: data?.severityCounts?.[s] ?? 0 })),
        ]}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search message, screen, team, reporter…"
          className="h-10 pl-9 sm:h-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{needle ? `Nothing matches “${query}”` : `Nothing ${statusFilter} right now`}</p>
            <p className="text-sm text-muted-foreground">Reports arrive from the Feedback button on any screen.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(byScreen).map(([screen, screenItems]) => (
          <div key={screen} className="space-y-2">
            <h2 className="text-base font-semibold">
              {screen} <span className="text-sm font-normal text-muted-foreground">({screenItems.length})</span>
            </h2>
            {screenItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={SEVERITY_STYLES[item.severity]}>{item.severity}</Badge>
                    <Badge variant="outline">{item.status}</Badge>
                    {item.teamName && <Badge variant="secondary">{item.teamName}</Badge>}
                    {item.season && <Badge variant="outline">season {item.season}</Badge>}
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{item.message}</p>

                  <p className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                    {item.userEmail ? ` · ${item.userEmail}` : ''} · <code>{item.route}</code>
                  </p>

                  {item.notes && <p className="rounded bg-muted/50 p-2 text-xs italic">{item.notes}</p>}

                  {item.context?.consoleErrors && item.context.consoleErrors.length > 0 && (
                    <details className="rounded-lg bg-muted/50 p-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        {item.context.consoleErrors.length} console error
                        {item.context.consoleErrors.length === 1 ? '' : 's'}
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto text-xs">{item.context.consoleErrors.join('\n')}</pre>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {STATUSES.filter((s) => s !== item.status).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="ghost"
                        className="h-9 text-xs sm:h-8"
                        onClick={() => setStatus.mutate({ id: item.id, status })}
                      >
                        Mark {status}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
};

export default FeedbackPage;
