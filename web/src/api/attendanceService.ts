import api from './api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED' | 'LATE';

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  EXCUSED: number;
  LATE: number;
}

export interface AttendanceLocation {
  id: string;
  name: string;
}

export interface AttendanceSession {
  id: string;
  seasonId: string;
  date: string;
  time: string | null;
  location: AttendanceLocation | null;
  createdAt: string;
  counts: AttendanceCounts;
  recordCount: number;
}

export interface AttendanceRecord {
  id: string;
  athleteId: string;
  name: string;
  gender: string | null;
  grade: number | null;
  status: AttendanceStatus;
  notes: string | null;
  updatedAt: string;
}

export interface AttendanceSessionDetail extends AttendanceSession {
  records: AttendanceRecord[];
}

export interface CreateAttendanceSessionInput {
  seasonId: string;
  date: string;
  time?: string | null;
  locationId?: string | null;
}

// Field-scoped on the backend (routes/attendance.js PATCH /:sessionId) — only
// send the keys that actually changed, same contract as PracticePlanInput.
export interface UpdateAttendanceSessionInput {
  date?: string;
  time?: string | null;
  locationId?: string | null;
}

export interface UpdateAttendanceRecordInput {
  status?: AttendanceStatus;
  notes?: string | null;
}

export const attendanceService = {
  async listSessions(seasonId: string): Promise<AttendanceSession[]> {
    const response = await api.get<AttendanceSession[]>('/attendance', { params: { seasonId } });
    return response.data;
  },

  async createSession(input: CreateAttendanceSessionInput): Promise<AttendanceSession> {
    const response = await api.post<AttendanceSession>('/attendance', input);
    return response.data;
  },

  async getSession(id: string): Promise<AttendanceSessionDetail> {
    const response = await api.get<AttendanceSessionDetail>(`/attendance/${id}`);
    return response.data;
  },

  async updateSession(id: string, input: UpdateAttendanceSessionInput): Promise<AttendanceSession> {
    const response = await api.patch<AttendanceSession>(`/attendance/${id}`, input);
    return response.data;
  },

  async deleteSession(id: string) {
    const response = await api.delete(`/attendance/${id}`);
    return response.data;
  },

  async addRecord(sessionId: string, athleteId: string) {
    const response = await api.post<{ id: string; athleteId: string; status: AttendanceStatus; notes: string | null }>(
      `/attendance/${sessionId}/records`,
      { athleteId }
    );
    return response.data;
  },

  // Single-athlete, field-scoped — never resends another athlete's row or
  // untouched fields of this one (routes/attendance.js's comment on this
  // route explains why that matters).
  async updateRecord(sessionId: string, athleteId: string, input: UpdateAttendanceRecordInput) {
    const response = await api.patch<{ id: string; athleteId: string; status: AttendanceStatus; notes: string | null }>(
      `/attendance/${sessionId}/records/${athleteId}`,
      input
    );
    return response.data;
  },

  async removeRecord(sessionId: string, athleteId: string) {
    const response = await api.delete(`/attendance/${sessionId}/records/${athleteId}`);
    return response.data;
  },
};
