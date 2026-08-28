import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, ShieldCheck, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { getApiErrorMessage } from '../../lib/apiError';
import { isFullCoach, isImpersonatingAdmin } from '../../lib/teamRole';
import { exportService } from '../../api/exportService';

// "This data is yours, you can export it at any time."
//
// The card states what is in the file and what is deliberately left out,
// read from the server's own manifest rather than a list typed here — so
// the promise on screen cannot drift from what the export actually does.

export function DataExportCard() {
  const { currentUser } = useAuth();
  // Same check the server makes: GET /api/export/team is
  // requireRole(['HEAD_COACH']). A super admin counts only while actually
  // impersonating a team, or the button just 403s.
  // Follows the server: the export moved from head-coach-only to
  // requireRole(FULL_COACH) — a coach is equal to a head coach except for
  // deleting data, and an export deletes nothing.
  const canExportTeam = isFullCoach(currentUser) || isImpersonatingAdmin(currentUser);

  const { data: manifest } = useQuery({ queryKey: ['exportManifest'], queryFn: exportService.manifest });
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    try {
      await exportService.downloadTeam();
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not build the export.'));
    } finally {
      setBusy(false);
    }
  };

  const tables = manifest?.team ?? [];
  const entered = tables.filter((t) => !t.derived);
  const computed = tables.filter((t) => t.derived);

  return (
    <div className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">What you get</p>
          <p className="mt-1 text-muted-foreground">
            A ZIP containing <span className="font-mono text-xs">data.json</span> — everything, with
            the exact structure and relationships the app stores — and a{' '}
            <span className="font-mono text-xs">csv/</span> folder with one spreadsheet per table.
            A README explains both.
          </p>
        </div>

        {tables.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {entered.length} table{entered.length === 1 ? '' : 's'} of your team's own records
            </p>
            <div className="flex flex-wrap gap-1">
              {entered.map((t) => (
                <Badge key={t.key} variant="secondary" className="font-normal">{t.label}</Badge>
              ))}
            </div>
            {computed.length > 0 && (
              <>
                {/* Worth separating: if a coach ever rebuilds from this
                    file, these are the numbers they could regenerate and
                    everything above is what they could not. */}
                <p className="pt-1 text-sm font-medium">Plus {computed.length} the app computed</p>
                <div className="flex flex-wrap gap-1">
                  {computed.map((t) => (
                    <Badge key={t.key} variant="outline" className="font-normal">{t.label}</Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {manifest && Object.keys(manifest.excluded).length > 0 && (
          <details className="rounded-md border border-dashed p-3 text-sm">
            <summary className="cursor-pointer font-medium">What's deliberately left out</summary>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              {Object.entries(manifest.excluded).map(([model, why]) => (
                <li key={model}>
                  <span className="font-mono">{model}</span> — {why}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            Your team join code, pending invite links and billing identifiers are stripped from
            every export — they're live credentials, and exports get emailed around.
          </span>
        </p>

        {canExportTeam ? (
          <Button onClick={handleDownload} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {busy ? 'Building your export…' : 'Download everything'}
          </Button>
        ) : (
          // Every coach can read this data a screen at a time; bundling the
          // whole roster into one downloadable file is a different act, and
          // the server restricts it to the head coach.
          <p className="text-sm text-muted-foreground">
            Your head coach can download the full team export. You can still export your own data
            from your profile.
          </p>
        )}
    </div>
  );
}

export default DataExportCard;
