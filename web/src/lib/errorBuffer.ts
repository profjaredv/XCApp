// A small ring buffer of recent client-side errors, attached to feedback
// reports automatically.
//
// The single most useful thing in a bug report is what the console said, and
// it's the thing a person is least likely to copy by hand — by the time they
// think to look, they've usually navigated away.

const MAX_ENTRIES = 20;
const MAX_LEN = 1000;

const buffer: string[] = [];

function record(kind: string, parts: unknown[]) {
  const text = parts
    .map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ''}`;
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ')
    .slice(0, MAX_LEN);

  const stamp = new Date().toISOString().slice(11, 19);
  buffer.push(`[${stamp}] ${kind}: ${text}`);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

let installed = false;

export function installErrorBuffer() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Wrap console.error rather than replacing it: devtools must still show
  // everything exactly as before.
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    record('console.error', args);
    originalError(...args);
  };

  window.addEventListener('error', (event) => {
    record('uncaught', [event.message, event.error].filter(Boolean));
  });

  window.addEventListener('unhandledrejection', (event) => {
    record('unhandled promise', [event.reason]);
  });
}

export function getRecentErrors(): string[] {
  return [...buffer];
}

export function clearErrorBuffer() {
  buffer.length = 0;
}
