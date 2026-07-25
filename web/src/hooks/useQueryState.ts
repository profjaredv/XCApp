import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Plain, readable query-param state: ?season=2025&tab=athletes, not
// ?team_a1b2c3d4-...:_tab="dashboard" (JSON-quoted, prefixed by the internal
// team UUID). That older scheme (hooks/useURLState.ts) was also keyed by
// teamId at the moment it was still loading, so state kept resetting when the
// real ID arrived — a real, if a somewhat funny, cause of the "URLs don't
// feel persistent" complaint. Now that the team is identified once in the
// route (/t/:athleticTeamId/...), query params don't need any of that.

/** A single string query param. Returns undefined when absent. */
export function useQueryParam(key: string): [string | undefined, (value: string | undefined) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? undefined;

  const setValue = useCallback(
    (next: string | undefined) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          if (next === undefined || next === '') {
            updated.delete(key);
          } else {
            updated.set(key, next);
          }
          return updated;
        },
        { replace: true }
      );
    },
    [key, setSearchParams]
  );

  return [value, setValue];
}

/** A single numeric query param (e.g. ?season=2025). */
export function useQueryParamNumber(key: string): [number | undefined, (value: number | undefined) => void] {
  const [raw, setRaw] = useQueryParam(key);
  const parsed = raw !== undefined ? parseInt(raw, 10) : undefined;
  const value = parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;

  const setValue = useCallback(
    (next: number | undefined) => setRaw(next === undefined ? undefined : String(next)),
    [setRaw]
  );

  return [value, setValue];
}
