import React from 'react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// The phone equivalent of the desktop side panels — a slide-up sheet, not
// a blocking dialog with its own buttons, so it stays consistent with the
// spec's "no modal dialogs" rule (this closes on an outside tap, nothing
// inside it needs a Cancel/OK).
export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative max-h-[70vh] rounded-t-2xl border-t border-ink-border bg-ink text-ink-foreground shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-border px-4 py-3">
          <span className="text-sm font-medium">{title}</span>
          <button type="button" onClick={onClose} className="text-xs text-ink-muted">
            Done
          </button>
        </div>
        <div className="max-h-[calc(70vh-48px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
