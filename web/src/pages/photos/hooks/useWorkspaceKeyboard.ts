import { useEffect } from 'react';
import { usePhotosWorkspace } from '../state/PhotosWorkspaceContext';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

// The keyboard-shortcuts table from the spec's Interface section, wired to
// one hook mounted once at the workspace root so Load/Tag/Build share the
// same keys rather than each module re-implementing its own subset.
export function useWorkspaceKeyboard(onOpenArmPalette: () => void, armPaletteOpen: boolean): void {
  const {
    state,
    actor,
    setSelection,
    openLoupe,
    closeLoupe,
    tagSelected,
    untagSelected,
    togglePickSelected,
    hideSelected,
    undo,
    redo,
    gridOrderRef,
  } = usePhotosWorkspace();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (armPaletteOpen) return; // the palette owns its own keys while open

      const mod = e.metaKey || e.ctrlKey;

      // Undo/redo work everywhere in the workspace, not just the grid.
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (isTypingTarget(e.target)) return;

      // Everything below operates on a grid, which only Tag and Build have.
      if (state.module !== 'tag' && state.module !== 'build') return;

      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const { orderedIds } = gridOrderRef.current;
        setSelection(orderedIds, orderedIds[0] ?? null);
        return;
      }

      switch (e.key) {
        case 'Escape':
          if (state.loupePhotoId) closeLoupe();
          else setSelection([], null);
          break;
        case ' ': {
          e.preventDefault();
          if (state.loupePhotoId) closeLoupe();
          else if (state.selectedPhotoIds[0]) openLoupe(state.selectedPhotoIds[0]);
          break;
        }
        case 't':
        case 'T':
          if (actor.isCoach) onOpenArmPalette();
          break;
        case 'Enter':
          tagSelected();
          break;
        case 'u':
        case 'U':
          untagSelected();
          break;
        case 'p':
        case 'P':
          togglePickSelected();
          break;
        case 'h':
        case 'H':
          hideSelected();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const { orderedIds, columns } = gridOrderRef.current;
          if (orderedIds.length === 0) break;
          const currentId = state.anchorPhotoId ?? orderedIds[0];
          const idx = Math.max(0, orderedIds.indexOf(currentId));
          const delta =
            e.key === 'ArrowUp' ? -columns : e.key === 'ArrowDown' ? columns : e.key === 'ArrowLeft' ? -1 : 1;
          const nextIdx = Math.min(Math.max(0, idx + delta), orderedIds.length - 1);
          const nextId = orderedIds[nextIdx];
          setSelection([nextId], nextId);
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    state.module,
    state.loupePhotoId,
    state.selectedPhotoIds,
    state.anchorPhotoId,
    actor,
    setSelection,
    openLoupe,
    closeLoupe,
    tagSelected,
    untagSelected,
    togglePickSelected,
    hideSelected,
    undo,
    redo,
    gridOrderRef,
    onOpenArmPalette,
    armPaletteOpen,
  ]);
}
