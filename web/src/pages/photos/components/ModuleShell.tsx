import React, { useState } from 'react';
import { PanelLeft, PanelRight } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface ModuleShellProps {
  leftPanel: React.ReactNode;
  leftLabel: string;
  center: React.ReactNode;
  rightPanel?: React.ReactNode;
  rightLabel?: string;
  filmStrip?: React.ReactNode;
  /** Overlays (the loupe, the arm palette) that render outside the grid layout. */
  children?: React.ReactNode;
}

// The one frame every module (Load, Tag, Build) shares: a left panel to
// choose what to look at, the canvas in the middle, a right panel for
// detail, and a filmstrip below — per the spec's "One frame for every
// module" principle. On a phone, the side panels become sheets opened
// from two small edge buttons instead of competing with the canvas for
// width.
export const ModuleShell: React.FC<ModuleShellProps> = ({
  leftPanel,
  leftLabel,
  center,
  rightPanel,
  rightLabel,
  filmStrip,
  children,
}) => {
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-56 shrink-0 border-r border-ink-border md:block">{leftPanel}</div>

        <div className="relative min-h-0 min-w-0 flex-1">{center}</div>

        {rightPanel && <div className="hidden w-64 shrink-0 border-l border-ink-border lg:block">{rightPanel}</div>}
      </div>

      {filmStrip && <div className="h-20 shrink-0 border-t border-ink-border">{filmStrip}</div>}

      {/* Phone-width edge buttons replacing the always-visible side panels. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-between px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileLeftOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs text-ink-foreground shadow-lg ring-1 ring-ink-border"
        >
          <PanelLeft className="h-3.5 w-3.5" /> {leftLabel}
        </button>
        {rightPanel && (
          <button
            type="button"
            onClick={() => setMobileRightOpen(true)}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-xs text-ink-foreground shadow-lg ring-1 ring-ink-border"
          >
            {rightLabel} <PanelRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <BottomSheet open={mobileLeftOpen} onClose={() => setMobileLeftOpen(false)} title={leftLabel}>
        {leftPanel}
      </BottomSheet>
      {rightPanel && (
        <BottomSheet open={mobileRightOpen} onClose={() => setMobileRightOpen(false)} title={rightLabel ?? 'Details'}>
          {rightPanel}
        </BottomSheet>
      )}

      {children}
    </div>
  );
};
