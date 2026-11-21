import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Heart, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSeasonSelection } from '@/contexts/SeasonContext';
import { rosterService } from '@/api/rosterService';
import { parentService } from '@/api/parentService';
import { getApiErrorMessage } from '@/lib/apiError';

// Invite a parent by email with their runners already chosen. Because the
// coach picks both the person and the children, accepting the invite is the
// approval — nothing lands in the pending queue. The parent has to accept
// with the same email address, so a forwarded invite opens nothing.

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Could not copy. Select the text and copy it yourself.');
  }
};

export const ParentInvitesCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeYear } = useSeasonSelection();
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const { data: roster = [] } = useQuery({
    queryKey: ['roster', activeYear],
    queryFn: () => rosterService.getRoster(activeYear ?? undefined),
    enabled: activeYear != null,
  });
  const { data: invites = [] } = useQuery({
    queryKey: ['parentInvites'],
    queryFn: () => parentService.listInvites(),
  });

  const athletes = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...roster]
      .map((a) => ({ id: a.id, name: a.preferredName || a.name }))
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roster, filter]);
  const nameOf = (id: string) => roster.find((a) => a.id === id)?.preferredName || roster.find((a) => a.id === id)?.name || '';

  const send = useMutation({
    mutationFn: () => parentService.invite(email.trim(), picked),
    onSuccess: (result) => {
      toast.success(result.msg);
      setLastLink(result.emailSent ? null : result.invite.link);
      setEmail('');
      setPicked([]);
      setFilter('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['parentInvites'] });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not send that invite.')),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => parentService.cancelInvite(id),
    onSuccess: () => {
      toast.success('Invite cancelled');
      queryClient.invalidateQueries({ queryKey: ['parentInvites'] });
    },
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && picked.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Heart className="h-5 w-5" />
          Invite a parent
        </CardTitle>
        <CardDescription>
          Choose the runners, enter the parent’s email, and they’re linked as soon as they accept. No approval step.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) send.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="parent-invite-email">Parent’s email</Label>
            <Input
              id="parent-invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Their runners</Label>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                    aria-label={`Remove ${nameOf(id)}`}
                  >
                    {nameOf(id)}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search the roster"
                aria-label="Search the roster"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {athletes.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No athletes match.</p>
              ) : (
                athletes.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50">
                    <Checkbox checked={picked.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
                    {a.name}
                  </label>
                ))
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={!ready || send.isPending}>
            {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send invite
          </Button>
        </form>

        {lastLink && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>The email didn’t go out. Send this link to the parent yourself:</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{lastLink}</code>
                <Button size="sm" variant="outline" onClick={() => copy(lastLink, 'Invite link')}>
                  Copy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {invites.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Waiting to be accepted</p>
            <ul className="divide-y text-sm">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{invite.email}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {invite.athletes.map((a) => a.name).join(', ') || 'No runners left on the roster'}
                      {invite.expired && ' · expired'}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => copy(invite.link, 'Invite link')} aria-label={`Copy invite link for ${invite.email}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancel.mutate(invite.id)}
                    disabled={cancel.isPending}
                    aria-label={`Cancel invite for ${invite.email}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ParentInvitesCard;
