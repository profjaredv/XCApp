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
 * photo, not a per-athlete thing. One standing, reusable link rather than
 * a per-person invite: a coach generates it once and shares it however
 * they like (text, email, a group chat) — any parent who has it can click
 * and join directly, no email typed in one at a time. Generating,
 * regenerating, or revoking the link is actually FULL_COACH-only
 * server-side (routes/photos.js); a volunteer coach who tries gets a
 * plain 403 toast rather than a frontend-side gate, since this module's
 * Actor model doesn't otherwise distinguish a volunteer coach from a full
 * one.
 */
export const PhotosAdminSection: React.FC<PhotosAdminSectionProps> = ({ active }) => {
  const [list, setList] = useState<PhotosAdminsList | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([photosService.listPhotosAdmins(), photosService.getPhotosAdminJoinLink()])
      .then(([admins, joinLink]) => {
        if (cancelled) return;
        setList(admins);
        setLink(joinLink.link);
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

  async function handleGenerate() {
    setWorking(true);
    try {
      const result = await photosService.generatePhotosAdminJoinLink();
      setLink(result.link);
      toast.success(link ? 'Link regenerated — the old one no longer works.' : 'Link ready to share.');
    } catch (error) {
      toast.error("Couldn't create that link.", { description: getApiErrorMessage(error) });
    } finally {
      setWorking(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied.');
    } catch {
      toast.error("Couldn't copy the link — select and copy it manually.");
    }
  }

  async function handleRevoke() {
    setWorking(true);
    try {
      await photosService.revokePhotosAdminJoinLink();
      setLink(null);
      toast.success('Link revoked. Anyone with the old one can no longer join.');
    } catch (error) {
      toast.error("Couldn't revoke that link.", { description: getApiErrorMessage(error) });
    } finally {
      setWorking(false);
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
        Share one link with anyone — a parent, or any other volunteer — to let them load, tag, and build collages
        without making them a coach. They never see the roster, results, or any other coaching tool; they also can't
        hide/delete photos or change these settings.
      </p>

      {loading && <p className="text-xs text-ink-muted">Loading…</p>}

      {!loading && (
        <div className="space-y-1.5">
          {link ? (
            <div className="flex gap-1.5">
              <Input readOnly value={link} className="h-8 flex-1 border-ink-border bg-transparent text-xs text-ink-foreground" onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant="outline" onClick={handleCopy}>
                Copy
              </Button>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">No link generated yet.</p>
          )}
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" disabled={working} onClick={handleGenerate}>
              {working ? 'Working…' : link ? 'Regenerate link' : 'Generate link'}
            </Button>
            {link && (
              <Button size="sm" variant="ghost" className="text-ink-muted" disabled={working} onClick={handleRevoke}>
                Revoke
              </Button>
            )}
          </div>
        </div>
      )}

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

      {list && list.admins.length === 0 && !loading && <p className="text-xs text-ink-muted">No one has joined yet.</p>}
    </div>
  );
};
