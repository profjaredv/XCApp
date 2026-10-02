import React, { useState } from 'react';
import { PhotosWorkspaceProvider } from './state/PhotosWorkspaceProvider';
import { usePhotosWorkspace } from './state/PhotosWorkspaceContext';
import { TopBar } from './components/TopBar';
import { MobileTabBar } from './components/MobileTabBar';
import { ArmPalette } from './components/ArmPalette';
import { LoadModule } from './modules/LoadModule';
import { TagModule } from './modules/TagModule';
import { BuildModule } from './modules/BuildModule';
import { useWorkspaceKeyboard } from './hooks/useWorkspaceKeyboard';

// The workspace is forced dark regardless of the rest of the app's theme
// (light or dark) — per the spec's "photos are the interface" principle,
// this is a dedicated neutral-dark surface (the design system's `ink`
// tokens — see index.css), not a reskin that follows the user's toggle.
const WorkspaceInner: React.FC = () => {
  const { state, armAthlete } = usePhotosWorkspace();
  const [armPaletteOpen, setArmPaletteOpen] = useState(false);

  useWorkspaceKeyboard(() => setArmPaletteOpen(true), armPaletteOpen);

  if (state.loading) {
    return (
      <div className="dark fixed inset-0 flex items-center justify-center bg-ink text-sm text-ink-muted">
        Loading photos…
      </div>
    );
  }

  if (state.bootstrapError) {
    return (
      <div className="dark fixed inset-0 flex flex-col items-center justify-center gap-2 bg-ink text-center text-ink-foreground">
        <div className="text-sm">Couldn't load LeadPack Photos.</div>
        <div className="text-xs text-ink-muted">{state.bootstrapError}</div>
      </div>
    );
  }

  return (
    <div className="dark fixed inset-0 flex flex-col bg-ink text-ink-foreground">
      <TopBar />
      <div className="min-h-0 flex-1 pb-16 md:pb-0">
        {state.module === 'load' && <LoadModule />}
        {state.module === 'tag' && <TagModule />}
        {state.module === 'build' && <BuildModule />}
      </div>
      <MobileTabBar />
      {armPaletteOpen && (
        <ArmPalette
          athletes={state.athletes}
          onArm={(athleteId) => {
            armAthlete(athleteId);
            setArmPaletteOpen(false);
          }}
          onCancel={() => setArmPaletteOpen(false)}
        />
      )}
    </div>
  );
};

const PhotosWorkspacePage: React.FC = () => (
  <PhotosWorkspaceProvider>
    <WorkspaceInner />
  </PhotosWorkspaceProvider>
);

export default PhotosWorkspacePage;
