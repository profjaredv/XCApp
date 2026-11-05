import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { photosService, type PhotosAdminsList } from '../../../api/photosService';
import { getApiErrorMessage } from '../../../lib/apiError';

interface PhotosAdminSectionProps {
  // Refetches the list each time the section mounts visible — the parent
  // dialog only renders this once it's open, so there's no separate
  // "fetch on open" wiring needed here.
  active: boolean;
}

/**
 * Invite anyone — not just a coach — to full Load/Tag/Build authority in
 * the Photos module (backend's PhotosAdmin). Lives inside Collage settings
 * since it's a once-per-team, coach-managed setting like accent/logo/team
 * photo, not a per-athlete thing. Sending an invite or revoking one is
 * actually FULL_COACH-only server-side (routes/photos.js); a volunteer
 * coach who tries gets a plain 403 toast rather than a frontend-side gate,
 * since this module's Actor model doesn't otherwise distinguish a
 * volunteer coach from a full one.
 */
export const PhotosAdminSection: React.FC<PhotosAdminSectionProps> = ({ active }) => {
  const [list, setList] = useState<PhotosAdminsList | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    photosService
      .listPhotosAdmins()
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch((error) => {
        if (!cancelled) toast.error("Couldn't load Photos Admins.", { description: getApiErrorMessage(error) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviting(true);
    try {
      const result = await photosService.sendPhotosAdminInvite(trimmed);
      toast.success(result.emailSent ? `Invite sent to ${trimmed}.` : `Invite ready for ${trimmed}.`, {
        description: result.emailSent ? undefined : "Couldn't send the email, but the invite is live — share the link yourself.",
      });
      setEmail('');
      setList((prev) => (prev ? { ...prev, pendingInvites: [{ email: trimmed, expiresAt: result.invite.expiresAt, createdAt: new Date().toISOString() }, ...prev.pendingInvites.filter((i) => i.email !== trimmed)] } : prev));
    } catch (error) {
      toast.error("Couldn't send that invite.", { description: getApiErrorMessage(error) });
    } finally {
      setInviting(false);
    }
  }

  async function handleToggleActive(userId: string, currentlyActive: boolean) {
    setUpdatingUserId(userId);
    try {
      await photosService.setPhotosAdminActive(userId, !currentlyActive);
      setList((prev) => (prev ? { ...prev, admins: prev.admins.map((a) => (a.userId === userId ? { ...a, active: !currentlyActive } : a)) } : prev));
      toast.success(currentlyActive ? 'Access revoked.' : 'Access restored.');
    } catch (error) {
      toast.error("Couldn't update that Photos Admin.", { description: getApiErrorMessage(error) });
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label>Photos Admins</Label>
      <p className="text-xs text-ink-muted">
        Invite anyone — a parent, or any other volunteer — to load, tag, and build collages without making them a
        coach. They never see the roster, results, or any other coaching tool; they also can't hide/delete photos or
        change these settings.
      </p>
      <div className="flex gap-1.5">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email to invite"
          className="h-8 flex-1 border-ink-border bg-transparent text-xs text-ink-foreground"
        />
        <Button size="sm" variant="outline" disabled={inviting || !email.trim()} onClick={handleInvite}>
          {inviting ? 'Sending…' : 'Invite'}
        </Button>
      </div>

      {loading && <p className="text-xs text-ink-muted">Loading…</p>}

      {list && list.admins.length > 0 && (
        <ul className="space-y-1">
          {list.admins.map((admin) => (
            <li key={admin.userId} className="flex items-center justify-between gap-2 rounded-md bg-ink-border/20 px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="truncate text-ink-foreground">{admin.name || admin.email}</p>
                {admin.name && <p className="truncate text-ink-muted">{admin.email}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={admin.active ? 'text-ink-muted' : 'text-ink-muted/60'}>{admin.active ? 'Active' : 'Revoked'}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-ink-muted"
                  disabled={updatingUserId === admin.userId}
                  onClick={() => handleToggleActive(admin.userId, admin.active)}
                >
                  {admin.active ? 'Revoke' : 'Restore'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list && list.pendingInvites.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Pending</p>
          <ul className="space-y-1">
            {list.pendingInvites.map((invite) => (
              <li key={invite.email} className="flex items-center justify-between gap-2 rounded-md bg-ink-border/10 px-2 py-1.5 text-xs text-ink-muted">
                <span className="truncate">{invite.email}</span>
                <span className="shrink-0">until {new Date(invite.expiresAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {list && list.admins.length === 0 && list.pendingInvites.length === 0 && (
        <p className="text-xs text-ink-muted">No one invited yet.</p>
      )}
    </div>
  );
};
