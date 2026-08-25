import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  attendanceService,
  type CreateAttendanceSessionInput,
  type UpdateAttendanceSessionInput,
  type UpdateAttendanceRecordInput,
} from '../api/attendanceService';

export function useAttendanceSessions(seasonId: string | null) {
  return useQuery({
    queryKey: ['attendanceSessions', seasonId],
    queryFn: () => attendanceService.listSessions(seasonId as string),
    enabled: !!seasonId,
  });
}

// Take-attendance page fetches by id directly, same reasoning as
// useIntervalSession — works from a bookmarked/shared link without the
// season context needing to load first.
export function useAttendanceSession(id: string | null) {
  return useQuery({
    queryKey: ['attendanceSession', id],
    queryFn: () => attendanceService.getSession(id as string),
    enabled: !!id,
  });
}

// The weekly grid (AttendancePage). weekStart is a "YYYY-MM-DD" Monday.
export function useAttendanceWeek(seasonId: string | null, weekStart: string | null) {
  return useQuery({
    queryKey: ['attendanceWeek', seasonId, weekStart],
    queryFn: () => attendanceService.getWeek(seasonId as string, weekStart as string),
    enabled: !!seasonId && !!weekStart,
  });
}

function useInvalidateSessions(seasonId: string | null) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['attendanceSessions', seasonId] });
}

function useInvalidateSingleSession() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['attendanceSession'] });
}

// Broad on purpose (no seasonId/weekStart key) — a record edit made from
// either the week grid or a single day's detail page should invalidate
// every cached week, since either surface can touch a day the other has
// cached.
function useInvalidateWeeks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['attendanceWeek'] });
}

export function useCreateAttendanceSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: (input: CreateAttendanceSessionInput) => attendanceService.createSession(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAttendanceSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const invalidateSession = useInvalidateSingleSession();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAttendanceSessionInput }) =>
      attendanceService.updateSession(id, input),
    onSuccess: () => {
      invalidate();
      invalidateSession();
    },
  });
}

export function useDeleteAttendanceSession(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  return useMutation({
    mutationFn: (id: string) => attendanceService.deleteSession(id),
    onSuccess: invalidate,
  });
}

// Add/remove refresh both the list (recordCount/counts shown there) and the
// specific session query the take-attendance page reads from — same
// double-invalidate as useAddIntervalEntry/useRemoveIntervalEntry.
export function useAddAttendanceRecord(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const invalidateSession = useInvalidateSingleSession();
  const invalidateWeeks = useInvalidateWeeks();
  return useMutation({
    mutationFn: ({ sessionId, athleteId }: { sessionId: string; athleteId: string }) =>
      attendanceService.addRecord(sessionId, athleteId),
    onSuccess: () => {
      invalidate();
      invalidateSession();
      invalidateWeeks();
    },
  });
}

export function useUpdateAttendanceRecord(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const invalidateSession = useInvalidateSingleSession();
  const invalidateWeeks = useInvalidateWeeks();
  return useMutation({
    mutationFn: ({
      sessionId,
      athleteId,
      input,
    }: {
      sessionId: string;
      athleteId: string;
      input: UpdateAttendanceRecordInput;
    }) => attendanceService.updateRecord(sessionId, athleteId, input),
    onSuccess: () => {
      invalidate();
      invalidateSession();
      invalidateWeeks();
    },
  });
}

export function useRemoveAttendanceRecord(seasonId: string | null) {
  const invalidate = useInvalidateSessions(seasonId);
  const invalidateSession = useInvalidateSingleSession();
  const invalidateWeeks = useInvalidateWeeks();
  return useMutation({
    mutationFn: ({ sessionId, athleteId }: { sessionId: string; athleteId: string }) =>
      attendanceService.removeRecord(sessionId, athleteId),
    onSuccess: () => {
      invalidate();
      invalidateSession();
      invalidateWeeks();
    },
  });
}
