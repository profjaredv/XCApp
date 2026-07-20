// Minimal toast utility to satisfy imports and provide basic feedback
// You can replace this with shadcn/ui toast implementation later.

export type ToastVariant = 'default' | 'destructive' | 'success' | 'info' | 'warning';

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

function format(prefix: string, options: ToastOptions) {
  const parts = [prefix];
  if (options.title) parts.push(options.title);
  if (options.description) parts.push(`- ${options.description}`);
  if (options.variant && options.variant !== 'default') parts.push(`(${options.variant})`);
  return parts.join(' ');
}

export function useToast() {
  const toast = (options: ToastOptions) => {
    const message = format('Toast:', options);
    // Prefer non-blocking console display in dev
    console.log(message);

    // Basic user feedback in the browser if available
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      // Non-intrusive: use a temporary top-right notification via DOM
      try {
        const containerId = '__app_toast_container__';
        let container = document.getElementById(containerId);
        if (!container) {
          container = document.createElement('div');
          container.id = containerId;
          container.style.position = 'fixed';
          container.style.top = '12px';
          container.style.right = '12px';
          container.style.zIndex = '9999';
          container.style.display = 'flex';
          container.style.flexDirection = 'column';
          container.style.gap = '8px';
          document.body.appendChild(container);
        }
        const node = document.createElement('div');
        node.style.padding = '10px 12px';
        node.style.borderRadius = '8px';
        node.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        node.style.color = '#111827';
        node.style.background = options.variant === 'destructive' ? '#FEE2E2' : '#E5E7EB';
        node.style.border = '1px solid rgba(0,0,0,0.05)';
        node.style.fontSize = '14px';
        node.style.maxWidth = '320px';
        node.style.wordBreak = 'break-word';
        node.textContent = `${options.title ?? 'Notice'}${options.description ? ` — ${options.description}` : ''}`;
        container.appendChild(node);
        setTimeout(() => {
          node.style.transition = 'opacity 300ms ease';
          node.style.opacity = '0';
          setTimeout(() => node.remove(), 300);
        }, 2500);
      } catch {
        // Fallback alert if DOM injection fails
        alert(message);
      }
    }
  };

  return { toast };
}
