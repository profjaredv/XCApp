import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Copy, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { teamService } from '../../api/teamService';

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
      const message = getErrorMessage(err) || 'Failed to send invite.';
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
      toast.error(getErrorMessage(err) || 'Failed to update staff member.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: StaffRole) => {
    try {
      await teamService.updateStaffMember(userId, { role: newRole });
      toast.success('Role updated.');
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err) || 'Failed to update role.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff</CardTitle>
        <CardDescription>
          Invite other coaches by name and role. Only head coaches can send invites or change
          another staff member's access — everyone else can see who has it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? 'Active' : 'Revoked'}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(member.userId, member.active)}
                        >
                          {member.active ? 'Revoke' : 'Restore'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resendingEmail === invite.email}
                          onClick={() => handleResendInvite(invite.email, invite.role as StaffRole)}
                        >
                          {resendingEmail === invite.email ? 'Resending…' : 'Resend'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getErrorMessage(err: unknown): string | null {
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    typeof (err as { response?: { data?: { msg?: string } } }).response?.data?.msg === 'string'
  ) {
    return (err as { response: { data: { msg: string } } }).response.data.msg;
  }
  return err instanceof Error ? err.message : null;
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
