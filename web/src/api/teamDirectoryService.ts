import axios from 'axios';

// The team directory is the only endpoint called before anyone is signed
// in, so it deliberately does NOT go through api/axios.ts — that instance
// attaches a bearer token and runs a refresh interceptor, both of which
// are meaningless here and one of which would try to refresh a session
// that does not exist.

const BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:3001/api');

export interface DirectoryTeam {
  id: string;
  name: string;
  athleticTeamId: string;
  /** Whether anyone can actually send a staff invite for this team. */
  hasHeadCoach: boolean;
}

export interface DirectorySearch {
  query: string;
  results: DirectoryTeam[];
  tooShort?: boolean;
}

export const teamDirectoryService = {
  async search(q: string, signal?: AbortSignal): Promise<DirectorySearch> {
    const response = await axios.get<DirectorySearch>(`${BASE}/team-directory/search`, {
      params: { q },
      signal,
    });
    return response.data;
  },
};
