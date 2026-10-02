import React from 'react';
import { ImagePlus, Tags, LayoutTemplate } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';
import type { Module } from '../state/types';

const TABS: { key: Module; label: string; icon: typeof Tags }[] = [
  { key: 'load', label: 'Load', icon: ImagePlus },
  { key: 'tag', label: 'Tag', icon: Tags },
  { key: 'build', label: 'Build', icon: LayoutTemplate },
];

export const MobileTabBar: React.FC = () => {
  const { state, actor, setModule } = usePhotosWorkspace();

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-ink-border bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.filter((t) => t.key !== 'load' || actor.isCoach).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setModule(key)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-0.5 text-xs',
            state.module === key ? 'text-accent' : 'text-ink-muted',
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </button>
      ))}
    </div>
  );
};
