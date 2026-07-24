import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

interface URLStateOptions {
  persist?: boolean;
  defaultValues?: Record<string, unknown>;
}

/**
 * Hook for managing state in URL parameters
 * Automatically syncs state with URL and maintains state across navigation
 */
export function useURLState<T extends Record<string, unknown>>(
  key: string,
  options: URLStateOptions = {}
) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { persist = true, defaultValues = {} } = options;

  // Get current state from URL
  const getState = useCallback((): T => {
    const state: Record<string, unknown> = {};
    
    // Get all URL params that start with our key
    for (const [param, value] of searchParams.entries()) {
      if (param.startsWith(`${key}_`)) {
        const stateKey = param.replace(`${key}_`, '');
        
        // Try to parse as JSON, fallback to string
        try {
          state[stateKey] = JSON.parse(value);
        } catch {
          state[stateKey] = value;
        }
      }
    }
    
    // Merge with defaults
    return { ...defaultValues, ...state } as T;
  }, [searchParams, key, defaultValues]);

  // Update URL with new state
  const setState = useCallback((newState: Partial<T> | ((prev: T) => Partial<T>)) => {
    const currentState = getState();
    const updatedState = typeof newState === 'function' 
      ? { ...currentState, ...newState(currentState) as unknown as Partial<T> }
      : { ...currentState, ...newState };

    if (!persist) {
      return updatedState;
    }

    // Create new search params
    const newSearchParams = new URLSearchParams(searchParams);
    
    // Remove existing params for this key
    for (const param of Array.from(newSearchParams.keys())) {
      if (param.startsWith(`${key}_`)) {
        newSearchParams.delete(param);
      }
    }

    // Add new params
    Object.entries(updatedState).forEach(([stateKey, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        newSearchParams.set(`${key}_${stateKey}`, JSON.stringify(value));
      }
    });

    // Update URL
    setSearchParams(newSearchParams);
    return updatedState;
  }, [getState, searchParams, setSearchParams, key, persist]);

  // Clear all state for this key
  const clearState = useCallback(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    for (const param of Array.from(newSearchParams.keys())) {
      if (param.startsWith(`${key}_`)) {
        newSearchParams.delete(param);
      }
    }

    setSearchParams(newSearchParams);
  }, [searchParams, setSearchParams, key]);

  // Get a specific value
  const getValue = useCallback(<K extends keyof T>(stateKey: K): T[K] => {
    const state = getState();
    return state[stateKey];
  }, [getState]);

  // Set a specific value
  const setValue = useCallback(<K extends keyof T>(stateKey: K, value: T[K]) => {
    // TS can't narrow a computed key back to Partial<T>; the double assertion
    // is the standard escape hatch for a single-key partial update.
    setState({ [stateKey]: value } as unknown as Partial<T>);
  }, [setState]);

  return {
    state: getState(),
    setState,
    clearState,
    getValue,
    setValue
  };
}

/**
 * Hook for managing team-specific state in URL
 * Format: /team/{teamId}/analytics?tab=overview&season=2025&athlete=123
 */
export function useTeamURLState<T extends Record<string, unknown>>(
  teamId: string,
  options: URLStateOptions = {}
) {
  return useURLState<T>(`team_${teamId}`, options);
}

/**
 * Hook for managing athlete-specific state in URL
 * Format: /team/{teamId}/athlete/{athleteId}?tab=summary&season=2025
 */
export function useAthleteURLState<T extends Record<string, unknown>>(
  teamId: string,
  athleteId: string,
  options: URLStateOptions = {}
) {
  return useURLState<T>(`athlete_${teamId}_${athleteId}`, options);
}

/**
 * Hook for managing global app state in URL
 * Format: /analytics?view=team&season=2025
 */
export function useAppURLState<T extends Record<string, unknown>>(
  options: URLStateOptions = {}
) {
  return useURLState<T>('app', options);
}
