import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useUiVersion } from '@/contexts/UiVersionContext';

// The switch-back sheet (docs/leadpack-new-ui-trial.md §1.3): one optional
// question, asked once per switch. Skipping it is fine — [Switch] with an
// empty box switches without a reason. The answer is stored with no name
// attached (UiSwitchEvent), capped at 500 characters server-side; the
// maxLength here just stops someone typing past what will be kept.
export const SwitchToClassicDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const { setUiVersion } = useUiVersion();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSwitch = async () => {
    setSaving(true);
    await setUiVersion('classic', reason.trim() || undefined);
    setSaving(false);
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Switch to classic</DialogTitle>
          <DialogDescription>You can come back to the new LeadPack anytime.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="switch-back-reason">What made you switch back? (optional)</Label>
          <Textarea
            id="switch-back-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="min-h-12 sm:min-h-10" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="min-h-12 sm:min-h-10" onClick={handleSwitch} disabled={saving}>
            Switch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SwitchToClassicDialog;
