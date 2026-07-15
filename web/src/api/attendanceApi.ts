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
