import api from './api';

export interface PracticeLocation {
  id: string;
  name: string;
  archived: boolean;
}

export const practiceLocationService = {
  async list(): Promise<PracticeLocation[]> {
    const response = await api.get<PracticeLocation[]>('/practice-locations');
    return response.data;
  },

  async create(name: string): Promise<PracticeLocation> {
    const response = await api.post<PracticeLocation>('/practice-locations', { name });
    return response.data;
  },

  async update(id: string, input: { name?: string; archived?: boolean }): Promise<PracticeLocation> {
    const response = await api.put<PracticeLocation>(`/practice-locations/${id}`, input);
    return response.data;
  },
};
