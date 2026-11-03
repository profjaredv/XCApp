import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { photosService, type PhotoDownloadLinkInfo } from '../../api/photosService';
import { getApiErrorMessage } from '../../lib/apiError';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Download, Loader2, XCircle } from 'lucide-react';

// The public landing page a parent reaches from a coach-sent email —
// see BuildRightPanel.tsx's "Notify parent" action and
// backend/routes/photos.js's GET /download-link/:token. No sign-in, no
// LeadPack account: the token in the URL is the only credential, and this
// page never sees or needs anything else about the visitor.
//
// Deliberately two steps, not an auto-download on load: a link a mail
// client prefetches or safety-scans should only ever hit the lightweight
// info call below, never pull the full ZIP — see photosService.ts's own
// comment on why getDownloadLinkInfo and downloadViaLink are separate
// calls.
const DownloadLinkPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PhotoDownloadLinkInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('Invalid download link.');
      setLoading(false);
      return;
    }
    photosService
      .getDownloadLinkInfo(token)
      .then((result) => setInfo(result))
      .catch((error) => setLoadError(getApiErrorMessage(error, 'This link is no longer valid.')))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleDownload() {
    if (!token) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await photosService.downloadViaLink(token);
    } catch (error) {
      setDownloadError(getApiErrorMessage(error, "Couldn't download those photos."));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Season Photos</CardTitle>
          {info && <CardDescription>{info.teamName}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading…</span>
            </div>
          )}

          {!loading && loadError && (
            <>
              <div className="flex items-center justify-center py-4">
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
              <Alert variant="destructive">
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
              <p className="text-center text-sm text-muted-foreground">Ask your coach to send a new link.</p>
            </>
          )}

          {!loading && info && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                <strong>{info.athleteName}</strong>'s tagged photos from this season are ready to download.
              </p>
              {downloadError && (
                <Alert variant="destructive">
                  <AlertDescription>{downloadError}</AlertDescription>
                </Alert>
              )}
              <Button onClick={handleDownload} disabled={downloading} className="w-full gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading ? 'Downloading…' : 'Download photos (ZIP)'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                This link works until {new Date(info.expiresAt).toLocaleDateString()}.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DownloadLinkPage;
