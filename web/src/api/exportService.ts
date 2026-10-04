import { api } from './axios';
import { downloadBlobFile } from '../lib/downloadBlob';

// Downloading an export.
//
// Fetched through axios rather than linked with a plain <a href>: every
// export endpoint is authenticated, and a browser following a bare link
// sends no Authorization header. So the file comes back as a blob and the
// download is triggered from that — see lib/downloadBlob.ts, shared with
// api/photosService.ts's athlete photo ZIP download.

export interface ExportTable {
  key: string;
  label: string;
  /** Computed by the app rather than entered by the team. */
  derived: boolean;
}

export interface ExportManifest {
  exportFormatVersion: number;
  team: ExportTable[];
  athlete: ExportTable[];
  /** model name -> why it is deliberately left out. */
  excluded: Record<string, string>;
}

export const exportService = {
  async manifest(): Promise<ExportManifest> {
    const { data } = await api.get('/export/manifest');
    return data;
  },

  downloadTeam(): Promise<void> {
    return downloadBlobFile(api, '/export/team', 'leadpack-team-export.zip', 'zip');
  },

  downloadAthlete(athleteId: string): Promise<void> {
    return downloadBlobFile(api, `/export/athlete/${athleteId}`, 'leadpack-athlete-export.zip', 'zip');
  },
};
