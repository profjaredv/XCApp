// Build spec's upload pipeline, steps 1 and 3: hashing for the server's
// dedupe check, and the direct-to-R2 PUT with real upload progress (a
// plain fetch() can't report progress on a request body, so this uses
// XHR, same as any other browser-direct-upload integration).

export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Upload failed (network error).'));
    xhr.send(body);
  });
}
