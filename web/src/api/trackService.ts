import api from './api';

// LeadPack Track & Field handoff (docs/leadpack-track-field-handoff.md).
// Every endpoint under /track is super-admin-gated server-side
// (backend/routes/track.js) — see that file's own header for why.

export interface TrackEvent {
  id: string;
  name: string;
  category: string;
  unit: string;
  scoringDirection: string;
  isRelay: boolean;
  relayLegCount: number | null;
  isMultiEvent: boolean;
  sortOrder: number;
}

export interface TrackStatus {
  hasTeam: boolean;
  trackSeasons: Array<{ id: string; year: number; isActive: boolean }>;
  trackMeetCount: number;
  trackResultCount: number;
  eventCatalogSize: number;
}

export const trackService = {
  async getEvents(): Promise<TrackEvent[]> {
    const response = await api.get<TrackEvent[]>('/track/events');
    return response.data;
  },

  async getStatus(): Promise<TrackStatus> {
    const response = await api.get<TrackStatus>('/track/status');
    return response.data;
  },
};
