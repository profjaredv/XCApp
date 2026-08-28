import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiError';
import { exportService } from '@/api/exportService';

// One athlete's own data, downloadable by them, their coach, or a guardian
// with an approved link (the server decides which — see routes/export.js).
//
// Same file whoever asks, so there is one answer to "what's in it": what
// the app already shows that person about themselves. Coach-private
// material is not in it — an export is not the place to newly disclose
// something the UI never showed them.
export const AthleteExportButton: React.FC<{
  athleteId: string;
  /** "your data" reads wrong when a coach downloads someone else's. */
  ownData?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}> = ({ athleteId, ownData = false, variant = 'outline', className }) => {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      await exportService.downloadAthlete(athleteId);
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not build the export.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant={variant} className={className} onClick={handleClick} disabled={busy}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {busy ? 'Building…' : ownData ? 'Download my data' : 'Export this athlete'}
    </Button>
  );
};

export default AthleteExportButton;
