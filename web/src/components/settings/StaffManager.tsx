import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Copy, UserPlus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { teamService } from '../../api/teamService';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../lib/apiError';
import { isFullCoach, isImpersonatingAdmin } from '../../lib/teamRole';

type StaffRole = 'HEAD_COACH' | 'COACH' | 'VOLUNTEER_COACH';

const ROLE_LABEL: Record<StaffRole, string> = {
  HEAD_COACH: 'Head Coach',
  COACH: 'Coach',
  VOLUNTEER_COACH: 'Volunteer Coach',
};

// Coach and volunteer access is granted by name, by a head coach — see
// routes/team.js POST /staff-invite. This is the screen UpgradeRolePage
// promises exists ("your head coach can send you an invite... from their
// Staff settings") but that, until now, was never actually built: only
// the accept-link page (StaffInviteAcceptPage) existed.
export function StaffManager() {
  const { currentUser } = useAuth();
  // Backend only lets HEAD_COACH send invites or edit another staff
  // member's role/access (routes/team.js) — everyone else who can reach
  // this screen gets the read-only view the card's own copy promises,
  // instead of interactive-looking controls that just 403 on click.
  //
  // isSuperAdmin ALONE is not enough, and matching the server on this
  // matters: middleware/auth.js's requireRole waves the super admin
  // through only when isImpersonating is also set — i.e. only once an
  // X-Admin-Team-Id has actually resolved to a team. Gating on
  // isSuperAdmin by itself showed a super admin who hadn't picked a team
  // in the switcher a live-looking Resend button that could only ever
  // answer 403.
  // Matches the server: staff management is requireRole(FULL_COACH) — a
  // coach is equal to a head coach except for deleting data. Volunteers
  // still only read this screen.
  const canManageStaff = isFullCoach(currentUser) || isImpersonatingAdmin(currentUser);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('COACH');
  const [isSending, setIsSending] = useState(false);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [lastInviteEmailSent, setLastInviteEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useStaffQuery();

  // Shared by the "invite a coach" form and the "resend" button on a
  // pending invite — POST /staff-invite upserts on (team, email), so
  // resending is just calling it again with the same email/role: it
  // overwrites the token and expiry and re-triggers the eusend email.
  const submitInvite = async (targetEmail: string, targetRole: StaffRole) => {
    setError(null);
    try {
      const result = await teamService.sendStaffInvite(targetEmail, targetRole);
      const link = `${window.location.origin}/staff-invite/${result.token}`;
      setLastInviteLink(link);
      setLastInviteEmailSent(result.emailSent);
      toast.success(result.emailSent ? `Invite emailed to ${result.invite.email}.` : `Invite ready for ${result.invite.email}.`);
      refetch();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to send invite.');
      setError(message);
      toast.error(message);
    }
  };

  const handleSendInvite = async () => {
    if (!email.includes('@')) {
      toast.error('Enter a valid email address.');
      return;
    }
    setIsSending(true);
    try {
      await submitInvite(email.trim(), role);
      setEmail('');
    } finally {
      setIsSending(false);
    }
  };

  const handleResendInvite = async (targetEmail: string, targetRole: StaffRole) => {
    setResendingEmail(targetEmail);
    try {
      await submitInvite(targetEmail, targetRole);
    } finally {
      setResendingEmail(null);
    }
  };

  const handleCopyLink = async () => {
    if (!lastInviteLink || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(lastInviteLink);
    toast.success('Invite link copied to clipboard');
  };

  const handleToggleActive = async (userId: string, active: boolean) => {
    try {
      await teamService.updateStaffMember(userId, { active: !active });
      toast.success(!active ? 'Access restored.' : 'Access revoked.');
      refetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update staff member.'));
    }
  };

  const handleRoleChange = async (userId: string, newRole: StaffRole) => {
    try {
      await teamService.updateStaffMember(userId, { role: newRole });
      toast.success('Role updated.');
      refetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update role.'));
    }
  };

  return (
    <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastInviteLink && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>
                {lastInviteEmailSent
                  ? "We've emailed this invite link. You can also copy it and send it yourself:"
                  : "We couldn't send the invite email (or it isn't configured yet) — copy this link and send it to them yourself:"}
              </p>
              <div className="flex items-center gap-2">
                <span className="break-all font-mono text-xs">{lastInviteLink}</span>
                <Button size="sm" variant="outline" onClick={handleCopyLink}>
                  <Copy className="h-3.5 w-3.5 mr-1" />
                  Copy
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {canManageStaff && (
          <div className="space-y-3 p-4 border rounded-lg">
            <Label className="text-sm font-semibold">Invite a coach</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                placeholder="coach@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HEAD_COACH">Head Coach</SelectItem>
                  <SelectItem value="COACH">Coach</SelectItem>
                  <SelectItem value="VOLUNTEER_COACH">Volunteer Coach</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleSendInvite} disabled={isSending || !email}>
                <UserPlus className="h-4 w-4 mr-2" />
                {isSending ? 'Sending…' : 'Send Invite'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading staff…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Current staff</Label>
              {!data?.staff.length ? (
                <p className="text-sm text-muted-foreground">No staff yet besides you.</p>
              ) : (
                <div className="space-y-2">
                  {data.staff.map((member) => (
                    <div
                      key={member.userId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-muted rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium">{member.name || member.email}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageStaff ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member.userId, v as StaffRole)}
                          >
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HEAD_COACH">Head Coach</SelectItem>
                              <SelectItem value="COACH">Coach</SelectItem>
                              <SelectItem value="VOLUNTEER_COACH">Volunteer Coach</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{ROLE_LABEL[member.role as StaffRole] || member.role}</span>
                        )}
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? 'Active' : 'Revoked'}
                        </Badge>
                        {canManageStaff && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleToggleActive(member.userId, member.active)}
                          >
                            {member.active ? 'Revoke' : 'Restore'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* The repair path for the commonest support question here.
                Someone who joined with the team code is an ATHLETE at the
                team level whatever their account says, which is what makes
                their menu look short. Promoting them is one click; before
                this they did not appear on the screen at all. */}
            {canManageStaff && !!data?.otherMembers.length && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Team members who aren't staff</Label>
                <p className="text-xs text-muted-foreground">
                  Anyone who joined with the team code is an athlete on the team, which limits what
                  they can see. If one of these is a coach, give them the right role here.
                </p>
                <div className="space-y-2">
                  {data.otherMembers.map((member) => (
                    <div
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{member.name || member.email}</p>
                        {member.name && <p className="text-xs text-muted-foreground">{member.email}</p>}
                      </div>
                      <Select onValueChange={(v) => handleRoleChange(member.userId, v as StaffRole)}>
                        <SelectTrigger className="w-[190px]">
                          <SelectValue placeholder="Make them staff…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!data?.pendingInvites.length && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Pending invites</Label>
                <div className="space-y-2">
                  {data.pendingInvites.map((invite) => (
                    <div
                      key={invite.email}
                      className="flex items-center justify-between gap-2 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {invite.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ROLE_LABEL[invite.role as StaffRole] || invite.role}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Expires {new Date(invite.expiresAt).toLocaleDateString()}
                        </span>
                        {canManageStaff && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={resendingEmail === invite.email}
                            onClick={() => handleResendInvite(invite.email, invite.role as StaffRole)}
                          >
                            {resendingEmail === invite.email ? 'Resending…' : 'Resend'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

// Local, not shared via useGroups' useStaff — that hook filters to active
// staff only (for a group-leader picker) and doesn't expose refetch in the
// shape this screen needs (both active/inactive, plus pending invites).
function useStaffQuery() {
  return useQuery({
    queryKey: ['teamStaffFull'],
    queryFn: () => teamService.getStaff(),
  });
}
