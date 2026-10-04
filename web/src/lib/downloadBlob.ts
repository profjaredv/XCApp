import type { AxiosInstance } from 'axios';

// Shared by every feature that downloads a file through an authenticated
// API call rather than a plain <a href> (which sends no Authorization
// header) — originally api/exportService.ts's own private helpers, pulled
// out here once api/photosService.ts needed the identical dance for
// downloading an athlete's photo ZIP.

/**
 * Pull the filename the server chose out of Content-Disposition. Falling
 * back to a generic name is fine; falling back silently to "download.zip"
 * for everything would not be.
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

/**
 * Fetch `path` as a blob and save it with the filename the server chose
 * (or `fallbackName`). `expectedMimeHint` (e.g. 'zip', 'png') guards
 * against silently saving a JSON error body that slipped through with a
 * 200 status as if it were the real file — better to fail loudly than to
 * hand someone a file whose extension lies about what's in it.
 */
export async function downloadBlobFile(api: AxiosInstance, path: string, fallbackName: string, expectedMimeHint: string): Promise<void> {
  let response;
  try {
    response = await api.get(path, { responseType: 'blob' });
  } catch (error) {
    const message = await messageFromBlobError(error);
    throw message ? new Error(message) : error;
  }

  const blob = response.data as Blob;
  if (blob.type && !blob.type.includes(expectedMimeHint)) {
    throw new Error('The server did not return the expected file. Nothing was downloaded.');
  }
  triggerDownload(blob, filenameFrom(response.headers['content-disposition'], fallbackName));
}
