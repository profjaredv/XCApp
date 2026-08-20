import React from 'react';

// The one place a practice plan's day-of fields get rendered "the way an
// athlete will actually see them" — shared between MyProgressPage.tsx (the
// athlete's real, published view) and SchedulePage.tsx's DayEditorDialog
// (a coach's live preview of an in-progress, possibly-unpublished draft).
// Keeping one implementation means a coach's preview can never drift out
// of sync with what athletes are actually shown.

export interface PracticePlanPreviewData {
  locationName?: string | null;
  startTime?: string | null;
  announcements?: string | null;
  preRun?: string | null;
  run?: string | null;
  postRun?: string | null;
  workoutTemplate?: { name: string; details?: string | null } | null;
  intervalSession?: { title: string; groupName?: string | null } | null;
}

export const PracticePlanPreview: React.FC<{ plan: PracticePlanPreviewData }> = ({ plan }) => {
  const hasDetails =
    plan.announcements || plan.preRun || plan.run || plan.postRun || plan.workoutTemplate || plan.intervalSession;

  return (
    <div className="space-y-3">
      {(plan.locationName || plan.startTime) && (
        <p className="text-sm text-muted-foreground">{[plan.locationName, plan.startTime].filter(Boolean).join(' · ')}</p>
      )}
      {plan.announcements && <p className="text-sm font-medium">{plan.announcements}</p>}
      {plan.preRun && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pre Run</p>
          <p className="text-sm">{plan.preRun}</p>
        </div>
      )}
      {plan.run && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Run</p>
          <p className="text-sm">{plan.run}</p>
        </div>
      )}
      {plan.postRun && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Post Run</p>
          <p className="text-sm">{plan.postRun}</p>
        </div>
      )}
      {plan.workoutTemplate && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{plan.workoutTemplate.name}</p>
          {plan.workoutTemplate.details && <p className="text-muted-foreground mt-1">{plan.workoutTemplate.details}</p>}
        </div>
      )}
      {plan.intervalSession && (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">{plan.intervalSession.title}</p>
          <p className="text-muted-foreground">{plan.intervalSession.groupName ?? 'All groups'}</p>
        </div>
      )}
      {!hasDetails && <p className="text-sm text-muted-foreground">No workout details posted yet.</p>}
    </div>
  );
};

export default PracticePlanPreview;
