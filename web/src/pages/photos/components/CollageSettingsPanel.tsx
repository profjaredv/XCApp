import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { photosService, type CollageSettings } from '../../../api/photosService';
import { getApiErrorMessage } from '../../../lib/apiError';
import { isHex } from '@/lib/teamColors';
import { PhotosAdminSection } from './PhotosAdminSection';
import type { Photo } from '../state/types';

interface CollageSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photosById: Map<string, Photo>;
  settings: CollageSettings | null;
  onSettingsChange: (settings: CollageSettings) => void;
}

/**
 * Build settings — accent color, logo, and team photo, all set once for
 * the whole team rather than per athlete (the group photo picker used to
 * live in BuildRightPanel; the accent/logo are new). Coach-only; the
 * caller (BuildLeftPanel) only renders the button that opens this for a
 * coach in the first place.
 */
export const CollageSettingsPanel: React.FC<CollageSettingsPanelProps> = ({ open, onOpenChange, photosById, settings, onSettingsChange }) => {
  const [accentDraft, setAccentDraft] = useState(settings?.accentColor ?? '');
  const [savingAccent, setSavingAccent] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [settingGroupPhoto, setSettingGroupPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-sync the draft whenever the dialog (re)opens with a fresh settings
  // snapshot — not on every `settings` change, since that would stomp on
  // whatever the coach is mid-typing in the hex field.
  useEffect(() => {
    if (open) setAccentDraft(settings?.accentColor ?? '');
  }, [open, settings?.accentColor]);

  async function saveAccent(value: string) {
    const normalized = value.trim() || null;
    if (normalized && !isHex(normalized)) {
      toast.error('Use a color like #2b6cb0.');
      return;
    }
    if (normalized === (settings?.accentColor ?? null)) return;
    setSavingAccent(true);
    try {
      const accentColor = await photosService.setCollageAccentColor(normalized);
      onSettingsChange({ ...(settings ?? { groupPhotoId: null, logoUrl: null }), accentColor });
    } catch (error) {
      toast.error("Couldn't save the accent color.", { description: getApiErrorMessage(error) });
      setAccentDraft(settings?.accentColor ?? '');
    } finally {
      setSavingAccent(false);
    }
  }

  async function handleLogoFile(file: File) {
    setUploadingLogo(true);
    try {
      const logoUrl = await photosService.uploadCollageLogo(file);
      onSettingsChange({ ...(settings ?? { groupPhotoId: null, accentColor: null }), logoUrl });
    } catch (error) {
      toast.error("Couldn't upload the logo.", { description: getApiErrorMessage(error) });
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleClearLogo() {
    setUploadingLogo(true);
    try {
      await photosService.clearCollageLogo();
      onSettingsChange({ ...(settings ?? { groupPhotoId: null, accentColor: null }), logoUrl: null });
    } catch (error) {
      toast.error("Couldn't remove the logo.", { description: getApiErrorMessage(error) });
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSetGroupPhoto(photoId: string | null) {
    setSettingGroupPhoto(true);
    try {
      const groupPhotoId = await photosService.setGroupPhoto(photoId);
      onSettingsChange({ ...(settings ?? { accentColor: null, logoUrl: null }), groupPhotoId });
    } catch (error) {
      toast.error("Couldn't set the team photo.", { description: getApiErrorMessage(error) });
    } finally {
      setSettingGroupPhoto(false);
    }
  }

  const groupPhotoId = settings?.groupPhotoId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Collage settings</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto">
          <p className="text-sm text-ink-muted">
            Set these once — every athlete's collage uses them. Leave anything blank to use the built-in default.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="collage-accent">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Accent color picker"
                value={isHex(accentDraft) ? accentDraft : '#2b6cb0'}
                onChange={(e) => {
                  setAccentDraft(e.target.value);
                  saveAccent(e.target.value);
                }}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-ink-border bg-transparent p-1"
              />
              <Input
                id="collage-accent"
                value={accentDraft}
                placeholder="#2b6cb0 (default)"
                onChange={(e) => setAccentDraft(e.target.value)}
                onBlur={(e) => saveAccent(e.target.value)}
                disabled={savingAccent}
                className="max-w-[10rem] border-ink-border bg-transparent font-mono text-sm text-ink-foreground"
              />
              {settings?.accentColor && (
                <Button type="button" variant="ghost" size="sm" disabled={savingAccent} onClick={() => { setAccentDraft(''); saveAccent(''); }}>
                  Reset
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Only the printed collage — this doesn't change the app's own colors for your team.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-ink-border/20 ring-1 ring-ink-border/60">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt="Collage logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-ink-muted">XC</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" disabled={uploadingLogo} onClick={() => fileInputRef.current?.click()}>
                  {uploadingLogo ? 'Working…' : settings?.logoUrl ? 'Change' : 'Upload logo'}
                </Button>
                {settings?.logoUrl && (
                  <Button size="sm" variant="ghost" className="text-ink-muted" disabled={uploadingLogo} onClick={handleClearLogo}>
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoFile(file);
                }}
              />
            </div>
            <p className="text-xs text-ink-muted">Blank uses the built-in LeadPack XC logo.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Team photo — back page</Label>
            <div className="flex items-center gap-3">
              {groupPhotoId && photosById.get(groupPhotoId) ? (
                <img
                  src={photosById.get(groupPhotoId)!.thumbUrl}
                  alt=""
                  className="h-14 w-20 rounded object-cover ring-1 ring-ink-border/60"
                />
              ) : (
                <div className="flex h-14 w-20 items-center justify-center rounded bg-ink-border/20 text-xs text-ink-muted ring-1 ring-ink-border/60">
                  None set
                </div>
              )}
              {groupPhotoId && (
                <Button size="sm" variant="ghost" className="text-ink-muted" disabled={settingGroupPhoto} onClick={() => handleSetGroupPhoto(null)}>
                  Remove
                </Button>
              )}
            </div>
            <div className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto">
              {Array.from(photosById.values()).map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  disabled={settingGroupPhoto}
                  onClick={() => handleSetGroupPhoto(photo.id)}
                  className={cn(
                    'aspect-square overflow-hidden rounded ring-1 ring-ink-border/60 hover:ring-accent disabled:opacity-50',
                    groupPhotoId === photo.id && 'ring-2 ring-accent',
                  )}
                >
                  <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
              {photosById.size === 0 && <p className="col-span-6 text-sm text-ink-muted">No photos uploaded yet.</p>}
            </div>
          </div>

          <PhotosAdminSection active={open} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
