import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Meet } from '../state/types';

// "Jump to 10:40 to 11:10" — lets a family land near their kid's race
// instead of scrolling past hundreds of thumbnails from other heats.
export const TimeWindowJump: React.FC<{ meet: Meet | undefined }> = ({ meet }) => {
  const { state, setTimeWindow } = usePhotosWorkspace();
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('09:30');

  if (!meet) return null;
  const day = meet.date.slice(0, 10);

  return (
    <div className="space-y-1.5 px-1">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        <Clock className="h-3 w-3" /> Jump to time
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-7 border-ink-border bg-transparent px-1.5 text-xs text-ink-foreground"
        />
        <span className="text-xs text-ink-muted">–</span>
        <Input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-7 border-ink-border bg-transparent px-1.5 text-xs text-ink-foreground"
        />
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 flex-1 text-xs"
          onClick={() => setTimeWindow({ start: `${day}T${start}:00`, end: `${day}T${end}:00` })}
        >
          Go
        </Button>
        {state.timeWindow && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTimeWindow(null)}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
};
