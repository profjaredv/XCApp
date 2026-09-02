import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '../ui/card';
import { cn } from '@/lib/utils';
import { accentFor, type SectionKey } from '@/lib/sectionAccent';

// One settings area, as a card you open.
//
// Settings had grown to seven full-height sections stacked vertically, so
// finding anything meant scrolling past everything. Collapsed, the whole
// screen now fits on one view and reads as a menu; expanded, a section is
// exactly what it was before.
//
// Sections open INDEPENDENTLY — opening one never closes another. An
// accordion would be tidier, but PaceZonesManager holds unsaved draft
// state, and silently discarding a coach's half-finished edits because
// they clicked a different heading is a much worse outcome than a slightly
// longer page.

export interface SettingsSectionProps {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** A word or two of live state on the collapsed card — "3 coaches", "on". */
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Styling for a section that deserves to look different (Danger Zone). */
  tone?: 'default' | 'danger';
  /** Which part of the app this section configures — decides its colour.
   *  Settings is a menu of unrelated things, so giving each card its own
   *  accent turns a wall of identical white boxes into something you can
   *  aim at. */
  section?: SectionKey;
  children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  id,
  title,
  description,
  icon: Icon,
  summary,
  open,
  onToggle,
  tone = 'default',
  section = 'neutral',
  children,
}) => {
  const danger = tone === 'danger';
  const accent = accentFor(section);
  return (
    <Card
      id={id}
      className={cn(
        'gap-0 overflow-hidden py-0 transition-shadow',
        // An expanded section spans the whole grid so its content gets full
        // width, which is what the forms inside were built for.
        open && 'md:col-span-2',
        open && 'shadow-md',
        danger && 'border-destructive/40'
      )}
    >
      {/* A band across the top rather than a tinted card: the section's
          own content sits below it and needs a neutral surface. */}
      {!danger && <div className={cn('h-1 w-full', accent.rail)} aria-hidden />}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className={cn(
          'flex w-full items-start gap-3 p-5 text-left transition-colors',
          'hover:bg-accent/50',
          danger && 'hover:bg-destructive/5'
        )}
      >
        <span
          className={cn(
            'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg',
            danger ? 'bg-destructive/10' : accent.soft
          )}
          aria-hidden
        >
          <Icon className={cn('h-5 w-5', danger ? 'text-destructive' : accent.text)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-xl font-semibold leading-tight', danger && 'text-destructive')}>
            {title}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
          {/* Live state on the closed card, so the overview answers the
              common questions without opening anything. */}
          {summary && !open && (
            <span className="mt-2 block text-xs font-medium text-foreground/80">{summary}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div id={`${id}-content`} className="border-t px-5 py-5">
          {children}
        </div>
      )}
    </Card>
  );
};

export default SettingsSection;
