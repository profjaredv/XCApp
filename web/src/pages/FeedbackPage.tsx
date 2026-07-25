import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Copy, Inbox } from 'lucide-react';
import api from '@/api/api';

// Review queue for everything logged through the feedback widget. Grouped by
// screen, because that's how reports arrive and how they're easiest to work
// through.

interface FeedbackItem {
  id: string;
  route: string;
  screen: string | null;
  season: number | null;
  severity: 'blocker' | 'bug' | 'polish' | 'idea';
  message: string;
  status: 'open' | 'triaged' | 'fixed' | 'wontfix';
  userEmail: string | null;
  createdAt: string;
  context?: { consoleErrors?: string[]; viewport?: string | null } | null;
}

const SEVERITY_STYLES: Record<FeedbackItem['severity'], string> = {
  blocker: 'bg-destructive text-white',
  bug: 'bg-accent text-accent-foreground',
  polish: 'bg-secondary text-secondary-foreground',
  idea: 'bg-muted text-muted-foreground',
};

const STATUS_FILTERS = ['open', 'triaged', 'fixed', 'wontfix'] as const;

const FeedbackPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const { data, isLoading } = useQuery<{ feedback: FeedbackItem[]; counts: Record<string, number> }>({
    queryKey: ['feedback', statusFilter],
    queryFn: async () => {
      const response = await api.get('/feedback', { params: { status: statusFilter } });
      return response.data;
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/feedback/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: () => toast.error('Could not update status'),
  });

  const copyExport = async () => {
    try {
      const response = await api.get('/feedback/export', { responseType: 'text' });
      await navigator.clipboard.writeText(String(response.data));
      toast.success('Copied as markdown — paste it straight into chat');
    } catch {
      toast.error('Could not copy export');
    }
  };

  const items = data?.feedback ?? [];
  const byScreen = items.reduce<Record<string, FeedbackItem[]>>((acc, item) => {
    const key = item.screen || item.route;
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Feedback</h1>
          <p className="text-muted-foreground">
            Everything logged from the in-app feedback button, grouped by screen.
          </p>
        </div>
        <Button variant="outline" onClick={copyExport}>
          <Copy className="mr-2 h-4 w-4" />
          Copy as markdown
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={statusFilter === status ? 'secondary' : 'outline'}
            onClick={() => setStatusFilter(status)}
          >
            {status}
            {data?.counts?.[status] ? ` (${data.counts[status]})` : ''}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nothing {statusFilter} right now</p>
            <p className="text-sm text-muted-foreground">
              Use the Feedback button on any screen to log something.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(byScreen).map(([screen, screenItems]) => (
          <div key={screen} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {screen}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({screenItems.length})
              </span>
            </h2>
            {screenItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={SEVERITY_STYLES[item.severity]}>{item.severity}</Badge>
                    {item.season && <Badge variant="outline">season {item.season}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                      {item.userEmail ? ` • ${item.userEmail}` : ''}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{item.message}</p>

                  {item.context?.consoleErrors && item.context.consoleErrors.length > 0 && (
                    <details className="rounded-lg bg-muted/50 p-3">
                      <summary className="cursor-pointer text-xs font-medium">
                        {item.context.consoleErrors.length} console error
                        {item.context.consoleErrors.length === 1 ? '' : 's'}
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto text-xs">
                        {item.context.consoleErrors.join('\n')}
                      </pre>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.filter((s) => s !== item.status).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="ghost"
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
