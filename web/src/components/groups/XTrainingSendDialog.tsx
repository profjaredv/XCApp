import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSendToXTraining } from '@/hooks/useGroups';

const X_TRAINING_DAY_OPTIONS = [
  { value: '1', label: 'Today only' },
  { value: '2', label: 'Next 2 days' },
  { value: '3', label: 'Next 3 days' },
  { value: '5', label: 'Next 5 days' },
  { value: '7', label: 'Next 7 days (1 week)' },
  { value: '14', label: 'Next 14 days (2 weeks)' },
];

// The "click XTraining" flow: the coach leading this athlete's training
// group sends them to cross-training, today or for the next N days, with
// a reason — a bounded GroupMembership that expires on its own (see
// backend POST /groups/x-training). Authorization is enforced server-side
// against the athlete's current training group, not checked here — a
// volunteer coach who isn't its leader just gets a 403 toast back.
//
// Shared by the Groups board and the group's Day view (GroupDayPage) —
// same dialog, same mutation, so "send to cross training" behaves
// identically no matter which screen a coach reaches it from.
export const XTrainingSendDialog: React.FC<{
  athlete: { id: string; name: string } | null;
  seasonId: string | null;
  onClose: () => void;
  /** Fires after a successful send, before the dialog closes — e.g. the
   * Day view uses this to also mark today's attendance excused. */
  onSent?: (athleteId: string) => void;
}> = ({ athlete, seasonId, onClose, onSent }) => {
  const [days, setDays] = useState('1');
  const [reason, setReason] = useState('');
  const sendToXTraining = useSendToXTraining(seasonId);

  if (!athlete) return null;

  const handleClose = () => {
    onClose();
    setDays('1');
    setReason('');
  };

  const handleSend = async () => {
    if (!reason.trim()) return;
    try {
      await sendToXTraining.mutateAsync({ athleteId: athlete.id, days: Number(days), reason: reason.trim() });
      toast.success(`${athlete.name} sent to Cross Training.`);
      onSent?.(athlete.id);
      handleClose();
    } catch (err) {
      const message = (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? 'Could not send to Cross Training.';
      toast.error(message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {athlete.name} to Cross Training</DialogTitle>
          <DialogDescription>
            Their training group membership is untouched — this runs alongside it and reverts on its own when the
            window above ends.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Duration</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {X_TRAINING_DAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. shin splints, coach's call to cross-train ahead of Saturday's meet"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSend} disabled={!reason.trim() || sendToXTraining.isPending}>
            {sendToXTraining.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default XTrainingSendDialog;
