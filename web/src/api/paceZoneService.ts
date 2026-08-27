import { api } from './axios';
import type { PaceZoneDefinition } from '@/lib/paceZones';

// A team's own pace-zone definitions. Definitions only — resolving one to
// an actual pace needs an athlete's race and happens client-side in
// lib/paceZones.ts, so nothing here computes anything.

export type PaceZoneInput = Omit<PaceZoneDefinition, 'id'>;

export const paceZoneService = {
  async list(): Promise<PaceZoneDefinition[]> {
    const { data } = await api.get('/pace-zones');
    return data.zones ?? [];
  },

  // Saves the whole set at once. The server replaces what it has, so an
  // omitted zone is a deleted zone — the editor always sends every row.
  async save(zones: PaceZoneInput[]): Promise<PaceZoneDefinition[]> {
    const { data } = await api.put('/pace-zones', { zones });
    return data.zones ?? [];
  },
};
