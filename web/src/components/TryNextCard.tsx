import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUiVersion } from '@/contexts/UiVersionContext';

// Classic's invitation into the UI trial (docs/leadpack-new-ui-trial.md
// §1.3): one line at the top of Today, dismissible. Dismissing is a
// per-device convenience, so localStorage is enough — the sidebar's
// "Try the new LeadPack" item stays as the way in after that.
const DISMISSED_KEY = 'xc_try_next_dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export const TryNextCard: React.FC = () => {
  const { uiVersion, setUiVersion } = useUiVersion();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || uiVersion !== 'classic') return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Storage blocked: it just comes back next visit.
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm">Try the new LeadPack. You can switch back anytime.</p>
      <Button size="sm" onClick={() => setUiVersion('next')}>
        Try it
      </Button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TryNextCard;
