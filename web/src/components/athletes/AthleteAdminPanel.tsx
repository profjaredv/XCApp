import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Star, GraduationCap, Mail, Eye, UserMinus, Undo2, Pencil } from 'lucide-react';
import { rosterService, type RosterAthlete } from '@/api/rosterService';
import { athleteService } from '@/api/athleteService';
import { gradeLabel } from '@/lib/seasonUtils';
import { useTeamPath } from '@/hooks/useTeamRoute';
import { setPreviewAthlete } from '@/lib/impersonation';

// Every per-athlete admin action, on the athlete's own page.
//
// These all used to live as buttons on the roster row — up to nine of them
// per athlete, wrapping onto three lines on a phone and pushing the actual
// roster (names, grades, groups) off the screen. They belong here: they
// are all about ONE athlete, and this is the page about that athlete.
//
// The roster keeps only what a list is for: seeing everyone, and getting
// to one of them.
//
// Reads the same roster query key the roster page uses, so a change made
// here lands there without a refetch dance, and vice versa.

interface AthleteAdminPanelProps {
  athleteId: string;
  season: number;
}

export const AthleteAdminPanel: React.FC<AthleteAdminPanelProps> = ({ athleteId, season }) => {
  const queryClient = useQueryClient();
  const teamPath = useTeamPath();

  const { data: rosterRows = [], isLoading } = useQuery({
    queryKey: ['roster', season],
    queryFn: () => rosterService.getRoster(season),
    enabled: Number.isFinite(season),
  });
  const athlete: RosterAthlete | undefined = rosterRows.find((a) => a.id === athleteId);

  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [classYearOpen, setClassYearOpen] = useState(false);
  const [classYearGrade, setClassYearGrade] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roster'] });
    queryClient.invalidateQueries({ queryKey: ['athleteIdentity', athleteId] });
  };

  const saveNickname = useMutation({
    mutationFn: () => rosterService.updateAthlete(athleteId, { preferredName: nicknameDraft.trim() }),
    onSuccess: () => { invalidate(); setNicknameOpen(false); toast.success('Saved'); },
    onError: () => toast.error('Could not save that nickname.'),
  });

  const saveClassYear = useMutation({
    mutationFn: () => {
      // Grade is a function of (graduationYear, season) and is derived on
      // read — storing the graduation year is what keeps it true next year.
      const grade = Number(classYearGrade);
      return rosterService.updateAthlete(athleteId, { graduationYear: season + (12 - grade) });
    },
    onSuccess: () => { invalidate(); setClassYearOpen(false); toast.success('Class year set'); },
    onError: () => toast.error('Could not set that class year.'),
  });

  const setCaptain = useMutation({
    mutationFn: (isCaptain: boolean) => rosterService.setCaptain(athlete!.seasonId!, athleteId, isCaptain),
    onSuccess: () => { invalidate(); },
    onError: () => toast.error('Could not update captain status.'),
  });

  const saveNotes = useMutation({
    mutationFn: () => rosterService.setCaptain(athlete!.seasonId!, athleteId, true, notesDraft.trim()),
    onSuccess: () => { invalidate(); setNotesOpen(false); toast.success('Notes saved'); },
    onError: () => toast.error('Could not save those notes.'),
  });

  const removeFromRoster = useMutation({
    mutationFn: () => rosterService.removeFromRoster(season, athleteId),
    onSuccess: () => { invalidate(); toast.success('Removed from this season\'s roster'); },
    onError: () => toast.error('Could not remove them from the roster.'),
  });

  const clearRemovalFlag = useMutation({
    mutationFn: () => rosterService.clearRemovalFlag(season, athleteId),
    onSuccess: () => { invalidate(); toast.success('Kept on the roster'); },
    onError: () => toast.error('Could not clear that flag.'),
  });

  const sendInvite = useMutation({
    mutationFn: () => athleteService.inviteAthlete(athleteId, inviteEmail.trim()),
    onSuccess: () => { invalidate(); setInviteOpen(false); toast.success('Invite sent'); },
    onError: () => toast.error('Could not send that invite.'),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading admin actions…</p>;
  if (!athlete) {
    return (
      <p className="text-sm text-muted-foreground">
        This athlete isn't on the {season} roster, so there's nothing to administer for this season.
      </p>
    );
  }

  const displayName = athlete.preferredName || athlete.name;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {athlete.graduated && <Badge variant="secondary">Graduated</Badge>}
        {athlete.isCaptain && <Badge><Star className="mr-1 h-3 w-3" />Captain</Badge>}
        {!athlete.graduationYear && <Badge variant="outline">Needs class year</Badge>}
        {athlete.flaggedForRemoval && <Badge variant="destructive">Flagged for removal</Badge>}
        {athlete.user ? (
          <Badge variant="outline">Account linked</Badge>
        ) : (
          <Badge variant="outline">No account</Badge>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          className="justify-start"
          onClick={() => { setNicknameDraft(athlete.preferredName ?? ''); setNicknameOpen(true); }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {athlete.preferredName ? 'Edit nickname' : 'Add nickname'}
        </Button>

        <Button
          variant="outline"
          className="justify-start"
          onClick={() => { setClassYearGrade(''); setClassYearOpen(true); }}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          {athlete.graduationYear ? 'Change class year' : 'Set class year'}
        </Button>

        {athlete.seasonId && (
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => setCaptain.mutate(!athlete.isCaptain)}
            disabled={setCaptain.isPending}
          >
            <Star className="mr-2 h-4 w-4" />
            {athlete.isCaptain ? 'Remove captain' : 'Make captain'}
          </Button>
        )}

        {athlete.isCaptain && (
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => { setNotesDraft(athlete.captainNotes ?? ''); setNotesOpen(true); }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Captain notes
          </Button>
        )}

        {!athlete.user && (
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => { setInviteEmail(athlete.invite?.email ?? ''); setInviteOpen(true); }}
          >
            <Mail className="mr-2 h-4 w-4" />
            {athlete.invite?.status === 'pending' ? 'Resend invite' : 'Invite to account'}
          </Button>
        )}

        {/* The only entry point to the preview feature — see RosterPage's
            note on why it survives rather than being deleted. */}
        <Button
          variant="outline"
          className="justify-start"
          title="See the app as they would: their own profile, log-a-run, race reflections"
          onClick={() => setPreviewAthlete(athleteId, displayName, teamPath)}
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview as {displayName}
        </Button>

        {athlete.flaggedForRemoval && (
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => clearRemovalFlag.mutate()}
            disabled={clearRemovalFlag.isPending}
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Keep on roster
          </Button>
        )}

        {athlete.onRoster && !athlete.graduated && (
          <Button
            variant="outline"
            className="justify-start text-destructive hover:text-destructive"
            onClick={() => removeFromRoster.mutate()}
            disabled={removeFromRoster.isPending}
          >
            <UserMinus className="mr-2 h-4 w-4" />
            Remove from {season} roster
          </Button>
        )}
      </div>

      <Dialog open={nicknameOpen} onOpenChange={setNicknameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nickname for {athlete.name}</DialogTitle>
            <DialogDescription>
              What they actually go by. Shown everywhere in the app; the legal name stays for
              Athletic.net matching.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="adminNickname">Preferred name</Label>
            <Input
              id="adminNickname"
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              placeholder="Leave blank to clear"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNicknameOpen(false)}>Cancel</Button>
            <Button onClick={() => saveNickname.mutate()} disabled={saveNickname.isPending}>
              {saveNickname.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={classYearOpen} onOpenChange={setClassYearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Class year for {displayName}</DialogTitle>
            <DialogDescription>
              Pick their grade for {season}. It's stored as a graduation year, so they move up on
              their own each season.
            </DialogDescription>
          </DialogHeader>
          <Select value={classYearGrade} onValueChange={setClassYearGrade}>
            <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
            <SelectContent>
              {[9, 10, 11, 12].map((g) => (
                <SelectItem key={g} value={String(g)}>{gradeLabel(g)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClassYearOpen(false)}>Cancel</Button>
            <Button onClick={() => saveClassYear.mutate()} disabled={!classYearGrade || saveClassYear.isPending}>
              {saveClassYear.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Captain notes — {displayName}</DialogTitle>
            <DialogDescription>Private to the coaching staff.</DialogDescription>
          </DialogHeader>
          <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesOpen(false)}>Cancel</Button>
            <Button onClick={() => saveNotes.mutate()} disabled={saveNotes.isPending}>
              {saveNotes.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite {displayName}</DialogTitle>
            <DialogDescription>
              Sends them a link to claim this profile and sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="adminInviteEmail">Email</Label>
            <Input
              id="adminInviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="them@example.com"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={() => sendInvite.mutate()}
              disabled={!inviteEmail.includes('@') || sendInvite.isPending}
            >
              {sendInvite.isPending ? 'Sending…' : 'Send invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AthleteAdminPanel;
