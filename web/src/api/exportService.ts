import { api } from './axios';

// Downloading an export.
//
// Fetched through axios rather than linked with a plain <a href>: every
// export endpoint is authenticated, and a browser following a bare link
// sends no Authorization header. So the file comes back as a blob and the
// download is triggered from that.

export interface ExportTable {
  key: string;
  label: string;
  /** Computed by the app rather than entered by the team. */
  derived: boolean;
}

export interface ExportManifest {
  exportFormatVersion: number;
  team: ExportTable[];
  athlete: ExportTable[];
  /** model name -> why it is deliberately left out. */
  excluded: Record<string, string>;
}

/**
 * Pull the filename the server chose out of Content-Disposition.
 *
 * The server names the file after the team or athlete and the date, which
 * is what makes a folder of these readable a year later. Falling back to a
 * generic name is fine; falling back silently to "download.zip" for
 * everything would not be.
 */
function filenameFrom(disposition: string | undefined, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(disposition ?? '');
  return match?.[1] ?? fallback;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick
  // later is enough for the click to have been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * With responseType 'blob', a JSON error body arrives as a Blob too — so
 * the usual error reader sees an opaque object and the user gets
 * "Something went wrong" for a server that said exactly what was wrong.
 * Read it back out as text before rethrowing.
 */
async function messageFromBlobError(error: unknown): Promise<string | null> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return null;
  try {
    const parsed = JSON.parse(await data.text());
    const msg = parsed?.msg ?? parsed?.message;
    return typeof msg === 'string' && msg.trim() ? msg : null;
  } catch {
    return null;
  }
}

async function download(path: string, fallbackName: string): Promise<void> {
  let response;
  try {
    response = await api.get(path, { responseType: 'blob' });
  } catch (error) {
    const message = await messageFromBlobError(error);
    throw message ? new Error(message) : error;
  }

  // A 200 that is not a zip means something answered in place of the
  // export. Better to fail loudly than to save a file named .zip that
  // isn't one — the whole promise here is that the file you get is your
  // data.
  const blob = response.data as Blob;
  if (blob.type && !blob.type.includes('zip')) {
    throw new Error('The server did not return an export file. Nothing was downloaded.');
  }
  triggerDownload(blob, filenameFrom(response.headers['content-disposition'], fallbackName));
}

export const exportService = {
  async manifest(): Promise<ExportManifest> {
    const { data } = await api.get('/export/manifest');
    return data;
  },

  downloadTeam(): Promise<void> {
    return download('/export/team', 'leadpack-team-export.zip');
  },

  downloadAthlete(athleteId: string): Promise<void> {
    return download(`/export/athlete/${athleteId}`, 'leadpack-athlete-export.zip');
  },
};
