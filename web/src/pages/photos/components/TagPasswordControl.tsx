import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAthleticTeamId } from '@/hooks/useTeamRoute';
import { photosService } from '../../../api/photosService';
import { getApiErrorMessage } from '@/lib/apiError';

// Coach-only (same tier as the rest of the Load module). Lets a team opt
// into the no-account tagging path (routes/photos.js's /volunteer-login,
// middleware/photosVolunteer.js): any device that knows this password can
// tag photos without signing in at all. Off by default for every team —
// setting a password here is what turns that door on.
export const TagPasswordControl: React.FC = () => {
  const athleticTeamId = useAthleticTeamId();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    photosService
      .getTagPasswordStatus()
      .then((status) => {
        if (!cancelled) setEnabled(status.enabled);
      })
      .catch((error) => console.error('Could not load tagging-password status:', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const link = athleticTeamId ? `${window.location.origin}/photos-tag-in/${athleticTeamId}` : '';

  async function handleSave() {
    const password = draft.trim();
    if (!password) return;
    setSaving(true);
    try {
      await photosService.setTagPassword(password);
      setEnabled(true);
      setDraft('');
      toast.success('Tagging password set. Share the link below to let anyone tag without an account.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't set that password."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTurnOff() {
    setSaving(true);
    try {
      await photosService.setTagPassword(null);
      setEnabled(false);
      toast.success('Tagging password turned off. Already-unlocked devices keep working until you turn Photos off entirely.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't turn that off."));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — copy the link by hand.');
    }
  }

  if (enabled === null) return null; // first load — avoids a flash of the "off" state

  return (
    <div className="space-y-1.5 border-t border-ink-border pt-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        <KeyRound className="h-3 w-3" /> Tagging password
      </div>
      {enabled ? (
        <div className="space-y-1.5">
          <div className="text-xs text-ink-muted">Anyone with this link can tag photos — no account needed.</div>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={link}
              onClick={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md bg-ink-border/40 px-2 py-1 text-[11px] text-ink-foreground outline-none"
            />
            <Button size="sm" variant="secondary" className="h-7 w-7 shrink-0 p-0" onClick={handleCopyLink} aria-label="Copy link">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <button type="button" onClick={handleTurnOff} disabled={saving} className="text-[11px] text-ink-muted underline hover:text-ink-foreground">
            Turn off
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Set a password…"
            disabled={saving}
            className="min-w-0 flex-1 rounded-md bg-ink-border/40 px-2 py-1.5 text-xs text-ink-foreground outline-none placeholder:text-ink-muted disabled:opacity-60"
          />
          <Button size="sm" variant="secondary" disabled={!draft.trim() || saving} onClick={handleSave}>
            Set
          </Button>
        </div>
      )}
    </div>
  );
};
