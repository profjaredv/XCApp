import api from './api';

export interface WorkoutTemplate {
  id: string;
  name: string;
  volumeTier: string | null;
  focus: string | null;
  durationMinutes: number | null;
  distanceMi: number | null;
  strength: boolean;
  details: string | null;
  archived: boolean;
}

export interface WorkoutTemplateInput {
  name: string;
  volumeTier?: string | null;
  focus?: string | null;
  durationMinutes?: number | null;
  distanceMi?: number | null;
  strength?: boolean;
  details?: string | null;
}

export const workoutTemplateService = {
  async list(): Promise<WorkoutTemplate[]> {
    const response = await api.get<WorkoutTemplate[]>('/workout-templates');
    return response.data;
  },

  async create(input: WorkoutTemplateInput): Promise<WorkoutTemplate> {
    const response = await api.post<WorkoutTemplate>('/workout-templates', input);
    return response.data;
  },

  async update(id: string, input: Partial<WorkoutTemplateInput & { archived: boolean }>): Promise<WorkoutTemplate> {
    const response = await api.put<WorkoutTemplate>(`/workout-templates/${id}`, input);
    return response.data;
  },
};
