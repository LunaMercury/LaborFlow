import { getApiBaseUrl } from "./apiBaseUrl";

const apiBaseUrl = getApiBaseUrl();

export type ConfirmPlannedAttendancePayload = {
  assignmentUuid?: string;
  scheduleDayUuid?: string;
  scope: "ASSIGNMENT" | "SCHEDULE_DAY" | "DATE" | "WEEK";
  workDate?: string;
};

type ConfirmPlannedAttendanceResponse = {
  confirmedCount: number;
};

export type AttendanceStatus = "DRAFT" | "WORKED" | "ABSENT" | "CANCELLED";
export type AttendanceTimeEntryType = "PLANNED" | "EXACT" | "ESTIMATED" | "UNKNOWN";

export type AttendanceRecord = {
  actualEndTime: string;
  actualStartTime: string;
  address: string;
  area: "men" | "women";
  assignmentUuid: string;
  attendanceUuid: string | null;
  breakMinutes: number;
  confirmed: boolean;
  displayName: string;
  ownerName: string;
  participantType: "registered" | "guest";
  pickupLocation: string;
  plannedEndTime: string;
  plannedStartTime: string;
  scheduleDayUuid: string;
  siteName: string;
  status: AttendanceStatus;
  taskNote: string;
  timeEntryType: AttendanceTimeEntryType;
  workDate: string;
  workerProfileUuid: string | null;
  workTitle: string;
};

export type AttendanceTask = {
  address: string;
  ownerName: string;
  plannedEndTime: string;
  plannedStartTime: string;
  scheduleDayUuid: string;
  siteName: string;
  taskNote: string;
  workDate: string;
  workTitle: string;
};

export type AttendanceRecordList = {
  records: AttendanceRecord[];
  tasks: AttendanceTask[];
};

export type UpdateAttendanceRecordPayload = {
  actualEndTime: string | null;
  actualStartTime: string | null;
  breakMinutes: number;
  status: AttendanceStatus;
  timeEntryType: AttendanceTimeEntryType;
};

type AttendanceTaskNoteResponse = {
  note: string;
  scheduleDayUuid: string;
};

async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function confirmPlannedAttendance(
  loginId: string,
  payload: ConfirmPlannedAttendancePayload,
): Promise<number> {
  const response = await fetch(
    `${apiBaseUrl}/api/attendance/confirm-planned?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error("예정 근무를 확정하지 못했습니다.");
  }

  const body = (await response.json()) as ConfirmPlannedAttendanceResponse;
  return body.confirmedCount;
}

export async function fetchAttendanceRecords(
  loginId: string,
  workDate: string,
): Promise<AttendanceRecordList> {
  const query = new URLSearchParams({ loginId, workDate });
  const response = await fetch(`${apiBaseUrl}/api/attendance/records?${query.toString()}`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "근태 기록을 불러오지 못했습니다."));
  }

  return (await response.json()) as AttendanceRecordList;
}

export async function updateAttendanceRecord(
  loginId: string,
  assignmentUuid: string,
  payload: UpdateAttendanceRecordPayload,
): Promise<AttendanceRecord> {
  const response = await fetch(
    `${apiBaseUrl}/api/attendance/records/${encodeURIComponent(assignmentUuid)}?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "근태 기록을 저장하지 못했습니다."));
  }

  return (await response.json()) as AttendanceRecord;
}

export async function updateAttendanceTaskNote(
  loginId: string,
  scheduleDayUuid: string,
  note: string,
): Promise<AttendanceTaskNoteResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/attendance/schedule-days/${encodeURIComponent(scheduleDayUuid)}/note?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ note }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "근태 메모를 저장하지 못했습니다."));
  }

  return (await response.json()) as AttendanceTaskNoteResponse;
}
