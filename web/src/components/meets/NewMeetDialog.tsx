import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateMeet } from '@/hooks/useMeetOps';
import { todayIso } from '@/lib/formatUtils';

// Create a meet by hand. Moved here verbatim from MeetsPage so the next
// shell's Meets list (docs/leadpack-new-ui-trial.md §4.6) creates meets
// the same way.
export const NewMeetDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seasonId: string | null;
  onCreated: (meetId: string) => void;
}> = ({ open, onOpenChange, seasonId, onCreated }) => {
  const createMeet = useCreateMeet(seasonId);
  const [newMeetName, setNewMeetName] = useState('');
  const [newMeetDate, setNewMeetDate] = useState(todayIso);
  const [newMeetLocation, setNewMeetLocation] = useState('');
  const [newMeetIsHome, setNewMeetIsHome] = useState<string>('unspecified');


  const handleCreateMeet = async () => {
    if (!newMeetName.trim() || !newMeetDate) return;
    try {
      const created = await createMeet.mutateAsync({
        name: newMeetName.trim(),
        date: newMeetDate,
        location: newMeetLocation.trim() || undefined,
        isHome: newMeetIsHome === 'unspecified' ? null : newMeetIsHome === 'home',
      });
      toast.success('Meet created.');
      onOpenChange(false);
      setNewMeetName('');
      setNewMeetLocation('');
      setNewMeetIsHome('unspecified');
      onCreated(created.id);
    } catch {
      toast.error('Could not create that meet.');
    }
  };

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New meet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={newMeetName} onChange={(e) => setNewMeetName(e.target.value)} placeholder="Sunfair Invite" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" value={newMeetDate} onChange={(e) => setNewMeetDate(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input className="mt-1" value={newMeetLocation} onChange={(e) => setNewMeetLocation(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label>Home or away</Label>
              <Select value={newMeetIsHome} onValueChange={setNewMeetIsHome}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Not set</SelectItem>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="away">Away</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreateMeet} disabled={!newMeetName.trim() || !newMeetDate || createMeet.isPending}>
              {createMeet.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
};
