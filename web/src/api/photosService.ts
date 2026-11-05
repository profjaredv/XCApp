import api from './api';
import { downloadBlobFile } from '../lib/downloadBlob';
import { putWithProgress } from '../pages/photos/lib/uploadPipeline';
import type { Athlete, AthleteBuildStats, Meet, Photo, PhotoAthlete, PhotoGroup, TagSource } from '../pages/photos/state/types';

// Backend routes: backend/routes/photos.js. Every call is scoped by the
// authenticated session's team (or, for a guardian, their approved
// GuardianLink's team) server-side — nothing here ever sends a teamId.

export interface PhotosMe {
  userId: string | null;
  isCoach: boolean;
  // An invited, non-coach account with full Load/Tag/Build authority in
  // this module only (backend/lib/photosAccess.js's PhotosAdmin) —
  // everywhere this never widens to hide/delete, collage branding, or the
  // tag-password itself; those stay coach-only.
  isPhotosAdmin: boolean;
  // Unlocked tagging with the team's shared password instead of signing
  // in — see lib/photosVolunteer.ts and middleware/photosVolunteer.js.
  isVolunteer: boolean;
  selfAthleteId: string | null;
  guardianAthleteIds: string[];
  // Groups (any type — training, captain, custom) this account leads, for
  // the active season — a captain's read-only group-coverage capability.
  // Always empty for a coach (isCoach already covers every group) or a
  // volunteer.
  ledGroupIds: string[];
  // The Build module's collage subtitle default — resolved server-side the
  // same way for a coach, an athlete, or a guardian (unlike GET
  // /teams/context, the app's usual source for this, which 403s for a
  // guardian — never a TeamMember).
  teamName: string | null;
}

// Build-settings team branding — set once, applies to every athlete's
// collage. accentColor/logoUrl null means "use the collage's own built-in
// default" (backend/lib/photosAccess.js's getCollageSettings).
export interface CollageSettings {
  groupPhotoId: string | null;
  accentColor: string | null;
  logoUrl: string | null;
}

export interface ApiPhoto {
  id: string;
  meetId: string;
  takenAt: string | null;
  width: number | null;
  height: number | null;
  status: 'pending' | 'ready' | 'hidden';
  thumbUrl: string;
  webUrl: string;
  tags: PhotoAthlete[];
}

export interface SendDownloadLinkResult {
  emailSent: boolean;
  downloadUrl: string;
  expiresAt: string;
}

// Photos Admin: an invited, non-coach account with full Load/Tag/Build
// authority in this module only (backend's PhotosAdmin). Mirrors
// routes/team.js's staff-invite shape, scoped to Photos.
export interface SendPhotosAdminInviteResult {
  msg: string;
  token: string;
  emailSent: boolean;
  invite: { token: string; email: string; expiresAt: string };
}

export interface PhotosAdminGrant {
  userId: string;
  name: string | null;
  email: string;
  active: boolean;
  createdAt: string;
}

export interface PhotosAdminPendingInvite {
  email: string;
  expiresAt: string;
  createdAt: string;
}

export interface PhotosAdminsList {
  admins: PhotosAdminGrant[];
  pendingInvites: PhotosAdminPendingInvite[];
}

// Shown on the public DownloadLinkPage — note this never includes an
// athlete id or any photo data, only enough to render a "ready to
// download" confirmation. See backend/routes/photos.js's GET
// /download-link/:token for why the actual photos need their own
// (also-token-gated) route.
export interface PhotoDownloadLinkInfo {
  athleteName: string;
  teamName: string;
  expiresAt: string;
}

export interface AuthorizeFile {
  sha256: string;
  width?: number;
  height?: number;
  bytes?: number;
  takenAt?: string;
}

export interface AuthorizeResult {
  photoId: string;
  duplicate: boolean;
  putUrls: { original: string; thumb: string; web: string } | null;
}

export interface GoogleAlbumImportSummary {
  imported: number;
  duplicates: number;
  failed: number;
  failedDetails: string[];
  total: number;
  truncated: number;
}

export interface GoogleAlbumImportItem {
  id: string;
  status: 'queued' | 'downloading' | 'done' | 'duplicate' | 'error';
  photoId?: string;
  error?: string;
}

export interface GoogleAlbumImportProgress {
  status: 'scraping' | 'running' | 'done' | 'error';
  total: number;
  items: GoogleAlbumImportItem[];
  summary: GoogleAlbumImportSummary | null;
  error: string | null;
}

export interface FinalizeResult {
  ok: boolean;
  alreadyReady?: boolean;
  reason?: string;
  missing?: { original: boolean; thumb: boolean; web: boolean };
}

// AthleteBuildStats and its nested types live in state/types.ts (the
// shape this whole feature's UI reads), re-exported here just so a
// caller only importing from photosService doesn't also need that path.
export type { AthleteBuildStats, AthleteBestByDistance, AthleteRaceResult } from '../pages/photos/state/types';

function toPhoto(p: ApiPhoto): Photo {
  return {
    id: p.id,
    meetId: p.meetId,
    takenAt: p.takenAt ?? new Date().toISOString(),
    width: p.width ?? 0,
    height: p.height ?? 0,
    status: p.status,
    thumbUrl: p.thumbUrl,
    webUrl: p.webUrl,
  };
}

export const photosService = {
  async me(): Promise<PhotosMe> {
    const response = await api.get<PhotosMe>('/photos/me');
    return response.data;
  },

  async roster(): Promise<{ athletes: Athlete[]; groups: PhotoGroup[] }> {
    const response = await api.get<{ athletes: Athlete[]; groups: PhotoGroup[] }>('/photos/roster');
    return response.data;
  },

  async meets(): Promise<Meet[]> {
    const response = await api.get<Meet[]>('/photos/meets');
    return response.data;
  },

  async createMeet(name: string, date: string): Promise<Meet> {
    const response = await api.post<Meet>('/photos/meets', { name, date });
    return response.data;
  },

  /** Returns photos plus their tags, split for the workspace's two separate state slices. */
  async listPhotos(params?: { meetId?: string; status?: 'hidden' }): Promise<{ photos: Photo[]; tags: Record<string, PhotoAthlete[]> }> {
    const response = await api.get<ApiPhoto[]>('/photos', { params });
    const photos = response.data.map(toPhoto);
    const tags: Record<string, PhotoAthlete[]> = {};
    for (const p of response.data) {
      if (p.tags.length > 0) tags[p.id] = p.tags;
    }
    return { photos, tags };
  },

  async originalUrl(photoId: string): Promise<string> {
    const response = await api.get<{ originalUrl: string }>(`/photos/${photoId}/original`);
    return response.data.originalUrl;
  },

  async tagPhoto(photoId: string, athleteId: string): Promise<PhotoAthlete> {
    const response = await api.post<{ athleteId: string; source: TagSource; taggedBy: string }>(`/photos/${photoId}/tags`, { athleteId });
    return response.data;
  },

  async untagPhoto(photoId: string, athleteId: string): Promise<void> {
    await api.delete(`/photos/${photoId}/tags/${athleteId}`);
  },

  // Build module's "move the photo to see faces" drag, plus how zoomed in
  // it is (scroll-to-zoom on the same control) — where this athlete's
  // collage crop should center on this photo. focalX/focalY are each 0-1;
  // focalZoom is 1 (the default) or higher.
  async setPhotoFocal(photoId: string, athleteId: string, focalX: number, focalY: number, focalZoom = 1): Promise<{ focalX: number; focalY: number; focalZoom: number | null }> {
    const response = await api.put<{ athleteId: string; focalX: number; focalY: number; focalZoom: number | null }>(
      `/photos/${photoId}/tags/${athleteId}/focal`,
      { focalX, focalY, focalZoom },
    );
    return { focalX: response.data.focalX, focalY: response.data.focalY, focalZoom: response.data.focalZoom };
  },

  // The one photo shared across every athlete's collage back page and
  // the Slideshow collection's own template — null until a coach sets
  // one (Build settings panel). Coach-only server-side; pass null to
  // clear it. Reading it is folded into getCollageSettings below now
  // (one fetch for the whole settings panel) — this is the setter only.
  async setGroupPhoto(photoId: string | null): Promise<string | null> {
    const response = await api.put<{ photoId: string | null }>('/photos/group-photo', { photoId });
    return response.data.photoId;
  },

  // Build settings (components/CollageSettingsPanel.tsx) — set once, team-
  // wide, so a coach never re-sets these per athlete. getCollageSettings
  // bundles the group photo's own id into this same read (one fetch for
  // the whole settings panel); it's still set through setGroupPhoto above.
  async getCollageSettings(): Promise<CollageSettings> {
    const response = await api.get<CollageSettings>('/photos/collage-settings');
    return response.data;
  },

  async setCollageAccentColor(accentColor: string | null): Promise<string | null> {
    const response = await api.put<{ accentColor: string | null }>('/photos/collage-settings', { accentColor });
    return response.data.accentColor;
  },

  // Two-step upload — presign, then PUT the bytes straight to R2 (never
  // through this server), then confirm — same shape as the Load module's
  // own photo upload (lib/uploadPipeline.ts's putWithProgress).
  async uploadCollageLogo(file: File): Promise<string | null> {
    const presign = await api.post<{ uploadUrl: string; key: string }>('/photos/collage-logo/presign', { contentType: file.type });
    await putWithProgress(presign.data.uploadUrl, file, file.type, () => {});
    const finalize = await api.put<{ logoUrl: string | null }>('/photos/collage-logo');
    return finalize.data.logoUrl;
  },

  async clearCollageLogo(): Promise<void> {
    await api.delete('/photos/collage-logo');
  },

  // Same same-origin-blob reasoning as getPhotoWebBlobUrl below — the
  // export canvas's logo load must not depend on R2's own CORS response
  // surviving whatever network it's on.
  async getCollageLogoBlobUrl(): Promise<string> {
    const response = await api.get('/photos/collage-logo/raw', { responseType: 'blob' });
    return URL.createObjectURL(response.data as Blob);
  },

  // The Slideshow module's flat, ordered (add order) photo collection —
  // coach-only. add/remove return the full updated id list so the module
  // never needs a second round trip to stay in sync with the server's
  // own order.
  async slideshowItems(): Promise<string[]> {
    const response = await api.get<string[]>('/photos/slideshow');
    return response.data;
  },

  async addSlideshowItem(photoId: string): Promise<string[]> {
    const response = await api.post<string[]>(`/photos/slideshow/${photoId}`);
    return response.data;
  },

  async removeSlideshowItem(photoId: string): Promise<string[]> {
    const response = await api.delete<string[]>(`/photos/slideshow/${photoId}`);
    return response.data;
  },

  downloadSlideshowPhotos(): Promise<void> {
    return downloadBlobFile(api, '/photos/slideshow/download', 'leadpack-slideshow-photos.zip', 'zip');
  },

  async picks(): Promise<Record<string, string[]>> {
    const response = await api.get<Record<string, string[]>>('/photos/picks');
    return response.data;
  },

  async setPicks(athleteId: string, photoIds: string[]): Promise<string[]> {
    const response = await api.put<string[]>(`/photos/picks/${athleteId}`, { photoIds });
    return response.data;
  },

  async hidePhoto(photoId: string): Promise<void> {
    await api.post(`/photos/${photoId}/hide`);
  },

  async unhidePhoto(photoId: string): Promise<void> {
    await api.post(`/photos/${photoId}/unhide`);
  },

  async deletePhoto(photoId: string): Promise<void> {
    await api.delete(`/photos/${photoId}`);
  },

  async setOptOut(athleteId: string, optOut: boolean): Promise<void> {
    await api.post(`/photos/athletes/${athleteId}/opt-out`, { optOut });
  },

  async authorizeUpload(meetId: string, files: AuthorizeFile[]): Promise<AuthorizeResult[]> {
    const response = await api.post<{ results: AuthorizeResult[] }>('/photos/authorize', { meetId, files });
    return response.data.results;
  },

  async finalizeUpload(photoIds: string[]): Promise<Record<string, FinalizeResult>> {
    const response = await api.post<{ results: Record<string, FinalizeResult> }>('/photos/finalize', { photoIds });
    return response.data.results;
  },

  // Runs entirely server-side (scrape, download, resize, upload) as a
  // background job — see backend/lib/googlePhotosImport.js and
  // routes/photos.js. This returns as soon as the job is created; the
  // Load module polls getGoogleAlbumImportProgress for live per-photo
  // status instead of waiting on one request for the whole album.
  async startGoogleAlbumImport(meetId: string, albumUrl: string): Promise<{ jobId: string }> {
    const response = await api.post<{ jobId: string }>('/photos/import/google-album', { meetId, albumUrl });
    return response.data;
  },

  async getGoogleAlbumImportProgress(jobId: string): Promise<GoogleAlbumImportProgress> {
    const response = await api.get<GoogleAlbumImportProgress>(`/photos/import/google-album/${jobId}`);
    return response.data;
  },

  // No account, no Authorization header — see PhotosTagInPage.tsx and
  // lib/photosVolunteer.ts, which stores the returned token and attaches
  // it (as X-Photos-Volunteer-Token) to every subsequent Photos request.
  async volunteerLogin(athleticTeamId: string, password: string): Promise<{ token: string }> {
    const response = await api.post<{ token: string }>('/photos/volunteer-login', { athleticTeamId, password });
    return response.data;
  },

  // Coach-only: the Load module's "Tagging password" control.
  async getTagPasswordStatus(): Promise<{ enabled: boolean }> {
    const response = await api.get<{ enabled: boolean }>('/photos/tag-password');
    return response.data;
  },

  async setTagPassword(password: string | null): Promise<{ enabled: boolean }> {
    const response = await api.put<{ enabled: boolean }>('/photos/tag-password', { password });
    return response.data;
  },

  async getAthleteBuildStats(athleteId: string): Promise<AthleteBuildStats> {
    const response = await api.get<AthleteBuildStats>(`/photos/athletes/${athleteId}/build-stats`);
    return response.data;
  },

  // Fetches a photo's web-size image through our own API (same-origin),
  // not the presigned R2 URL in Photo.webUrl, and hands back a local
  // blob: URL. Built for the Build module's export canvas specifically
  // (see collageRender.ts's crossOrigin note) — a <img crossOrigin=
  // "anonymous"> pointed straight at R2 depends on R2's CORS response
  // headers surviving whatever network the browser is on, and a school/
  // district content filter or TLS-inspecting proxy can strip those
  // headers while still letting the bytes through, which makes the export
  // fail with what looks like a CORS error no R2 setting can fix. A blob:
  // URL loaded from an authenticated same-origin fetch never needs CORS
  // at all. Caller owns the URL's lifetime — revoke it with
  // URL.revokeObjectURL once the image has been drawn to canvas.
  async getPhotoWebBlobUrl(photoId: string): Promise<string> {
    const response = await api.get(`/photos/${photoId}/web`, { responseType: 'blob' });
    return URL.createObjectURL(response.data as Blob);
  },

  // "Download my athlete's folder" — a ZIP of every photo this athlete is
  // tagged in, full resolution. See lib/downloadBlob.ts for why this goes
  // through axios as a blob rather than a plain link.
  downloadAthletePhotos(athleteId: string): Promise<void> {
    return downloadBlobFile(api, `/photos/athletes/${athleteId}/download`, `leadpack-photos-${athleteId}.zip`, 'zip');
  },

  downloadGroupPhotos(groupId: string): Promise<void> {
    return downloadBlobFile(api, `/photos/groups/${groupId}/download`, `leadpack-photos-group-${groupId}.zip`, 'zip');
  },

  // Coach-only: emails a parent a time-limited link to DownloadLinkPage
  // (web/src/pages/photos/DownloadLinkPage.tsx) so they can get their
  // athlete's photos without ever creating a LeadPack account. See
  // PhotoDownloadLink's schema comment for why this isn't the "public
  // share link" the build spec otherwise bars.
  async sendDownloadLink(athleteId: string, email: string): Promise<SendDownloadLinkResult> {
    const response = await api.post<SendDownloadLinkResult>(`/photos/athletes/${athleteId}/download-link`, { email });
    return response.data;
  },

  // The two halves of the public landing page: info first (so a link
  // preview/safety-scan never also pulls the full ZIP), then the download
  // itself only on an explicit click. No auth header is needed or sent —
  // the token itself is the credential.
  async getDownloadLinkInfo(token: string): Promise<PhotoDownloadLinkInfo> {
    const response = await api.get<PhotoDownloadLinkInfo>(`/photos/download-link/${token}`);
    return response.data;
  },

  downloadViaLink(token: string): Promise<void> {
    return downloadBlobFile(api, `/photos/download-link/${token}/zip`, `leadpack-photos-${token}.zip`, 'zip');
  },

  // Photos Admin management — FULL_COACH-only (a coach, not a volunteer
  // coach), matching routes/team.js's own staff-invite tier. Grants
  // Load/Tag/Build authority in this module only, never coaching access.
  async sendPhotosAdminInvite(email: string): Promise<SendPhotosAdminInviteResult> {
    const response = await api.post<SendPhotosAdminInviteResult>('/photos/admin-invite', { email });
    return response.data;
  },

  async listPhotosAdmins(): Promise<PhotosAdminsList> {
    const response = await api.get<PhotosAdminsList>('/photos/admins');
    return response.data;
  },

  async setPhotosAdminActive(userId: string, active: boolean): Promise<{ userId: string; active: boolean }> {
    const response = await api.patch<{ userId: string; active: boolean }>(`/photos/admins/${userId}`, { active });
    return response.data;
  },

  // Authenticated: the token identifies the invite; the signed-in session
  // is who's accepting it. Never makes the account a TeamMember — see
  // backend's PhotosAdmin schema comment.
  async acceptPhotosAdminInvite(token: string): Promise<{ msg: string; teamId: string; athleticTeamId: string }> {
    const response = await api.post<{ msg: string; teamId: string; athleticTeamId: string }>('/photos/accept-admin-invite', { token });
    return response.data;
  },
};
