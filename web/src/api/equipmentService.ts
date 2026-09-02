import api from './api';

export type EquipmentType = 'TOP' | 'BOTTOM' | 'SPIKES' | 'OTHER';
export type EquipmentCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'RETIRED';

export const EQUIPMENT_TYPES: EquipmentType[] = ['TOP', 'BOTTOM', 'SPIKES', 'OTHER'];
export const EQUIPMENT_CONDITIONS: EquipmentCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'RETIRED'];

export interface EquipmentItem {
  id: string;
  type: EquipmentType;
  identifier: string;
  size: string | null;
  condition: EquipmentCondition;
  retired: boolean;
  notes: string | null;
  checkedOutTo: { assignmentId: string; athleteId: string; athleteName: string } | null;
}

export interface OutstandingGroup {
  athleteId: string;
  athleteName: string;
  /** Roster name, when the team calls them something else — both are searched. */
  fullName?: string;
  gender?: 'M' | 'F' | null;
  items: Array<{ assignmentId: string; type: EquipmentType; identifier: string; checkedOutAt: string; dueDate: string | null }>;
}

export const equipmentService = {
  async list(type?: EquipmentType): Promise<EquipmentItem[]> {
    const response = await api.get<EquipmentItem[]>('/equipment', { params: type ? { type } : {} });
    return response.data;
  },

  async create(input: { type: EquipmentType; identifier: string; size?: string; condition?: EquipmentCondition; notes?: string }) {
    const response = await api.post('/equipment', input);
    return response.data as EquipmentItem;
  },

  async update(id: string, input: Partial<{ size: string; condition: EquipmentCondition; retired: boolean; notes: string }>) {
    const response = await api.put(`/equipment/${id}`, input);
    return response.data as EquipmentItem;
  },

  async checkout(input: {
    type: EquipmentType;
    identifier: string;
    athleteId: string;
    seasonId: string;
    size?: string;
    dueDate?: string;
    conditionOut?: EquipmentCondition;
    notes?: string;
  }) {
    const response = await api.post('/equipment/checkout', input);
    return response.data;
  },

  async returnItem(assignmentId: string, input: { conditionIn?: EquipmentCondition; notes?: string }) {
    const response = await api.post(`/equipment/assignments/${assignmentId}/return`, input);
    return response.data;
  },

  async outstanding(seasonId: string): Promise<OutstandingGroup[]> {
    const response = await api.get<OutstandingGroup[]>('/equipment/outstanding', { params: { seasonId } });
    return response.data;
  },
};
