import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '@/hooks/useTeam';
import { athleteService } from '@/api/athleteService';
import { teamService } from '@/api/teamService';
import { useAvailableSeasons } from '@/hooks/useAnalyticsData';
import { useCurrentSeason } from '@/hooks/useCurrentSeason';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PendingClaimsCard } from '@/components/PendingClaimsCard';

type InviteStatus = 'not_invited' | 'pending' | 'accepted' | 'expired' | 'revoked';

type RosterAthlete = {
  _id: string;
  name: string;
  graduationYear?: number;
  gender?: 'Men' | 'Women' | string;
  raceCount?: number;
  graduated?: boolean;
  invite?: {
    status: InviteStatus;
    email?: string;
    sentAt?: string;
    acceptedAt?: string;
  };
  user?: string;
};

const TeamPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTeam } = useTeam();
  // This screen's "current season" used to be a bare `new Date().getFullYear()`
  // that could never actually be selected: the seasons query below was called
  // with no teamId, which the hook requires to run at all (`enabled: !!teamId`),
  // so it silently never fired and this page was permanently stuck computing
  // "current" as the calendar year regardless of what data existed. Passing
  // currentTeam.id fixes that; useCurrentSeason() replaces the calendar-year
  // fallback with the same server-resolved season every other screen uses.
  const currentYear = useCurrentSeason();
  const { data: availableSeasons = [] } = useAvailableSeasons(currentTeam?.id);
  const currentSeason = useMemo(() => {
    if (availableSeasons.length === 0) return currentYear;
    return availableSeasons.includes(currentYear) ? currentYear : availableSeasons[0];
  }, [availableSeasons, currentYear]);
  const [selectedSeason, setSelectedSeason] = useState<number>(currentSeason);
  const [showOnlyActive, setShowOnlyActive] = useState<boolean>(true);
  const [roster, setRoster] = useState<RosterAthlete[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState<boolean>(false);
  const [inviteTarget, setInviteTarget] = useState<RosterAthlete | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // Initialize season to first available if needed
  useEffect(() => {
    if (availableSeasons.length > 0 && !availableSeasons.includes(selectedSeason)) {
      setSelectedSeason(currentSeason);
    }
  }, [availableSeasons, currentSeason, selectedSeason]);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // For current season, always show only active athletes
      // For historical seasons, respect the showOnlyActive toggle
      const isCurrentSeason = selectedSeason === currentSeason;
      const activeOnly = isCurrentSeason ? true : showOnlyActive;
      
      const res = await athleteService.getAthletes(selectedSeason, { activeOnly });
      setRoster(res as unknown as RosterAthlete[]);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Failed to load roster';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedSeason, showOnlyActive, currentSeason]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const openInviteDialog = (athlete: RosterAthlete) => {
    setInviteTarget(athlete);
    setInviteEmail(athlete.invite?.email || '');
    setInviteError(null);
    setInviteNotice(null);
    setInviteLink(null);
    setCopyMessage(null);
    setInviteDialogOpen(true);
  };

  const closeInviteDialog = () => {
    setInviteDialogOpen(false);
    setInviteTarget(null);
    setInviteEmail('');
    setInviteLoading(false);
  };

  const handleInviteSubmit = async () => {
    if (!inviteTarget || !inviteEmail) {
      setInviteError('Please provide an email to send the invitation.');
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const response = await athleteService.inviteAthlete(inviteTarget._id, inviteEmail);
      setInviteNotice(`Invitation sent to ${inviteEmail}.`);
      const tokenFromResponse = response?.token || response?.invite?.token;
      if (tokenFromResponse && typeof window !== 'undefined') {
        setInviteLink(`${window.location.origin}/invite/${tokenFromResponse}`);
      } else {
        setInviteLink(null);
      }
      setCopyMessage(null);
      await fetchRoster();
      closeInviteDialog();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to send invitation.';
      setInviteError(message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteLink);
        setCopyMessage('Invite link copied to clipboard.');
      } else {
        setCopyMessage('Copying not supported in this environment.');
      }
    } catch (err) {
      console.error('Failed to copy invite link:', err);
      setCopyMessage('Failed to copy invite link.');
    }
  };

  const handleDismissNotice = () => {
    setInviteNotice(null);
    setInviteLink(null);
    setCopyMessage(null);
  };

  const handleGenerateJoinCode = async () => {
    setIsGeneratingCode(true);
    setError(null);

    try {
      const response = await teamService.generateJoinCode();
      setJoinCode(response.joinCode);
    } catch (err) {
      console.error('Error generating join code:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate join code');
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyJoinCode = async () => {
    if (!joinCode) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(joinCode);
        setCopyMessage('Join code copied to clipboard!');
        setTimeout(() => setCopyMessage(null), 3000);
      }
    } catch (err) {
      console.error('Failed to copy join code:', err);
    }
  };

  const inviteBadgeFor = (athlete: RosterAthlete) => {
    if (athlete.user) {
      return { label: 'Accepted', variant: 'default' as const };
    }
    const status = athlete.invite?.status || 'not_invited';
    switch (status) {
      case 'pending':
        return { label: 'Invited', variant: 'outline' as const };
      case 'accepted':
        return { label: 'Accepted', variant: 'default' as const };
      case 'expired':
        return { label: 'Expired', variant: 'secondary' as const };
      case 'revoked':
        return { label: 'Revoked', variant: 'secondary' as const };
      default:
        return { label: 'Not Invited', variant: 'secondary' as const };
    }
  };

  const inviteButtonLabel = (athlete: RosterAthlete) => {
    if (athlete.user || athlete.invite?.status === 'accepted') {
      return 'Invite Sent';
    }
    if (athlete.invite?.status && athlete.invite.status !== 'not_invited') {
      return 'Resend Invite';
    }
    return 'Invite';
  };

  const inviteButtonDisabled = (athlete: RosterAthlete) => {
    return Boolean(athlete.user);
  };

  const formatInviteMeta = (athlete: RosterAthlete) => {
    if (!athlete.invite?.email || !athlete.invite.sentAt) return null;
    const sentDate = new Date(athlete.invite.sentAt);
    if (Number.isNaN(sentDate.getTime())) return athlete.invite.email;
    return `${sentDate.toLocaleDateString()} • ${athlete.invite.email}`;
  };

  const grouped = useMemo(() => {
    const byGrade: Record<string, RosterAthlete[]> = {};
    roster.forEach(a => {
      // Derive grade from graduationYear and selectedSeason if present
      const grade = typeof a.graduationYear === 'number' ? Math.max(6, Math.min(12, 13 - (a.graduationYear - selectedSeason))) : undefined;
      const key = grade ? `Grade ${grade}` : 'Unspecified';
      byGrade[key] = byGrade[key] || [];
      byGrade[key].push(a);
    });
    // Sort grades 12->6, then Unspecified
    const order = Object.keys(byGrade).sort((a, b) => {
      const ga = a.startsWith('Grade ') ? parseInt(a.replace('Grade ', '')) : -1;
      const gb = b.startsWith('Grade ') ? parseInt(b.replace('Grade ', '')) : -1;
      return gb - ga;
    });
    return { byGrade, order };
  }, [roster, selectedSeason]);

  const seasonLabel = `${selectedSeason} Cross Country${selectedSeason === currentYear ? ' (Current)' : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Team</h1>
          <p className="text-muted-foreground">Team settings and current roster</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
          >
            {availableSeasons.map(y => (
              <option key={y} value={y}>{y}{y === currentYear ? ' (Current)' : ''}</option>
            ))}
          </select>
          {selectedSeason !== currentYear && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showOnlyActive} onChange={(e) => setShowOnlyActive(e.target.checked)} />
              Show only athletes with race results
            </label>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold mb-4">Team Join Code</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Generate a code that athletes can use to join your team and claim their profiles.
        </p>
        
        {joinCode ? (
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-semibold">{joinCode}</span>
                <Button size="sm" variant="outline" onClick={handleCopyJoinCode}>
                  Copy Code
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with your athletes so they can join the team and claim their profiles.
            </p>
            {copyMessage && (
              <p className="text-xs text-green-600">{copyMessage}</p>
            )}
          </div>
        ) : (
          <Button 
            onClick={handleGenerateJoinCode} 
            disabled={isGeneratingCode}
            className="w-full"
          >
            {isGeneratingCode ? 'Generating...' : 'Generate Join Code'}
          </Button>
        )}
      </div>

      <PendingClaimsCard onClaimProcessed={fetchRoster} />

      <div className="space-y-4">
        {inviteNotice && (
          <Alert>
            <div className="space-y-2">
              <AlertDescription>{inviteNotice}</AlertDescription>
              {inviteLink && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono break-all">{inviteLink}</span>
                  <Button size="sm" variant="outline" onClick={handleCopyInviteLink}>
                    Copy Link
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Button size="sm" variant="ghost" onClick={handleDismissNotice}>
                  Dismiss
                </Button>
                {copyMessage && <span className="text-muted-foreground">{copyMessage}</span>}
              </div>
            </div>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Roster • {seasonLabel}</h2>
          <div className="text-sm text-muted-foreground">{loading ? 'Loading…' : `${roster.length} athletes`}{error ? ` • ${error}` : ''}</div>
        </div>

        {grouped.order.map(gradeKey => {
          const athletes = grouped.byGrade[gradeKey];
          // Split by gender
          const boys = athletes.filter(a => (a.gender || '').toLowerCase().startsWith('men'));
          const girls = athletes.filter(a => (a.gender || '').toLowerCase().startsWith('women'));
          const renderList = (list: RosterAthlete[], label: string) => (
            <div className="rounded-md border p-3">
              <div className="font-medium mb-2">{label} • {list.length}</div>
              <ul className="divide-y">
                {list.map(a => {
                  const badge = inviteBadgeFor(a);
                  const inviteMeta = formatInviteMeta(a);
                  return (
                    <li key={a._id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          <span>{a.name}</span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.graduationYear ? `Class of ${a.graduationYear}` : 'Grad year N/A'} • {a.raceCount ?? 0} results{a.graduated ? ' • Graduated' : ''}
                          {inviteMeta ? ` • Invited ${inviteMeta}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={inviteButtonDisabled(a)}
                          onClick={() => openInviteDialog(a)}
                        >
                          {inviteButtonLabel(a)}
                        </Button>
                        <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/team/${currentTeam?.id || 'current'}/athlete/${a._id}`)}
                      >
                        View Profile
                      </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );

          return (
            <div key={gradeKey} className="space-y-3">
              <h3 className="font-semibold">{gradeKey}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderList(boys, 'Boys')}
                {renderList(girls, 'Girls')}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={(open) => (open ? setInviteDialogOpen(true) : closeInviteDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Athlete</DialogTitle>
            <DialogDescription>
              Send an invitation so the athlete can access analytics, results, and their profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-email">Athlete Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="runner@example.com"
              />
            </div>
            {inviteError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeInviteDialog} disabled={inviteLoading}>
              Cancel
            </Button>
            <Button onClick={handleInviteSubmit} disabled={inviteLoading}>
              {inviteLoading ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamPage;
