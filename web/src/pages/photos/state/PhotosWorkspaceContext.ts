import { createContext, useContext, type Dispatch, type MutableRefObject } from 'react';
import type { WorkspaceState, TagFilter, BuildHeader, workspaceReducer } from './reducer';
import type { Module, PreviewRole, TemplateSize } from './types';
import type { Actor } from '../lib/tagRules';

export interface GridOrder {
  orderedIds: string[];
  columns: number;
}

export interface PhotosWorkspaceValue {
  state: WorkspaceState;
  actor: Actor;
  gridOrderRef: MutableRefObject<GridOrder>;
  setGridOrder: (order: GridOrder) => void;

  setModule: (module: Module) => void;
  setPreviewRole: (role: PreviewRole) => void;
  armAthlete: (athleteId: string | null) => void;
  setSelection: (photoIds: string[], anchorId: string | null) => void;
  openLoupe: (photoId: string) => void;
  closeLoupe: () => void;
  setThumbSize: (size: number) => void;
  setTagFilter: (filter: TagFilter) => void;
  setMeetFilter: (meetId: string | null) => void;
  setSearch: (query: string) => void;
  setTimeWindow: (range: { start: string; end: string } | null) => void;

  tagPhoto: (photoId: string, athleteId: string) => void;
  untagPhoto: (photoId: string, athleteId: string) => void;
  tagSelected: () => void;
  untagSelected: () => void;
  togglePickSelected: () => void;
  hideSelected: () => void;
  hidePhoto: (photoId: string) => void;
  undo: () => void;
  redo: () => void;

  addMeet: (name: string, date: string) => Promise<string>;
  setBuildAthlete: (athleteId: string | null) => void;
  setBuildTemplate: (size: TemplateSize) => void;
  setBuildHeader: (patch: Partial<BuildHeader>) => void;
  setBatchFilter: (photoIds: string[], meetId: string) => void;
  addPick: (athleteId: string, photoId: string) => void;
  removePick: (athleteId: string, photoId: string) => void;
  swapPick: (athleteId: string, position: number, photoId: string) => void;
  reorderPick: (athleteId: string, fromIndex: number, toIndex: number) => void;

  dispatch: Dispatch<Parameters<typeof workspaceReducer>[1]>;
}

export const PhotosWorkspaceCtx = createContext<PhotosWorkspaceValue | null>(null);

export function usePhotosWorkspace(): PhotosWorkspaceValue {
  const ctx = useContext(PhotosWorkspaceCtx);
  if (!ctx) throw new Error('usePhotosWorkspace must be used within PhotosWorkspaceProvider');
  return ctx;
}
