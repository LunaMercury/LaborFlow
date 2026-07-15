import { getApiBaseUrl } from "./apiBaseUrl";

const apiBaseUrl = getApiBaseUrl();

export type ScheduleAssignmentArea = "men" | "women";

export type ScheduleAssignment = {
  assignmentUuid?: string;
  area: ScheduleAssignmentArea;
  attendanceStatus?: string;
  displayName?: string;
  participantGroupUuid?: string;
  participantType?: "registered" | "guest";
  pickupLocation?: string;
  plannedEndTime?: string;
  plannedStartTime?: string;
  workerProfileUuid?: string | null;
  workerCount: number;
};

export type ScheduleTask = {
  address: string;
  assignments: ScheduleAssignment[];
  id: string;
  memo: string;
  ownerName: string;
  ownerUuid: string;
  requiredMen: number;
  requiredWomen: number;
  siteName: string;
  timeRange: string;
  title: string;
  workSiteId: string;
  workTypeCodes: string[];
};

type ScheduleTaskListResponse = {
  tasks: ScheduleTask[];
};

export type FarmOwnerOption = {
  uuid: string;
  displayName: string;
  businessName: string;
};

export type CreateScheduleTaskPayload = {
  address: string;
  endDate: string;
  endTime: string | null;
  memo: string;
  ownerUuid: string;
  requiredMen: number;
  requiredWomen: number;
  siteName: string;
  startDate: string;
  startTime: string | null;
  title: string;
  workTypeCodes: string[];
};

export type UpdateScheduleTaskPayload = {
  address: string;
  assignments: ScheduleAssignment[];
  memo: string;
  ownerUuid?: string | null;
  requiredMen: number;
  requiredWomen: number;
  title: string;
  workTypeCodes: string[];
};

export type RescheduleScheduleRangePayload = {
  endDate: string;
  startDate: string;
  taskIds: string[];
};

export type DeleteScheduleTaskRangePayload = {
  taskIds: string[];
};

export type AddGuestParticipantsPayload = {
  area: ScheduleAssignmentArea;
  displayName?: string;
  pickupLocation?: string;
  introducedByWorkerProfileUuid?: string;
  introductionType: "NONE" | "WORKER" | "EXTERNAL" | "UNKNOWN";
  participantCount: number;
  plannedEndTime?: string;
  plannedStartTime?: string;
  settlementRecipientWorkerProfileUuid?: string;
};

async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function fetchScheduleTasks(loginId: string, workDate: string): Promise<ScheduleTask[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
  );

  if (!response.ok) {
    throw new Error("작업 일정을 불러오지 못했습니다.");
  }

  const body = (await response.json()) as ScheduleTaskListResponse;
  return body.tasks;
}

export async function fetchFarmOwners(
  loginId: string,
  query: string,
): Promise<FarmOwnerOption[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/farm-owners?loginId=${encodeURIComponent(loginId)}&query=${encodeURIComponent(query)}`,
  );

  if (!response.ok) {
    throw new Error("농장주 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as FarmOwnerOption[];
}

export async function createScheduleTask(
  loginId: string,
  payload: CreateScheduleTaskPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "일정을 등록하지 못했습니다."));
  }

  return (await response.json()) as ScheduleTask;
}

export async function updateScheduleTask(
  loginId: string,
  workDate: string,
  taskId: string,
  payload: UpdateScheduleTaskPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "작업 일정을 저장하지 못했습니다."));
  }

  return (await response.json()) as ScheduleTask;
}

export async function addGuestParticipants(
  loginId: string,
  workDate: string,
  taskId: string,
  payload: AddGuestParticipantsPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/guest-participants?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "미등록 작업자를 추가하지 못했습니다."));
  }

  return (await response.json()) as ScheduleTask;
}

export async function rescheduleScheduleRange(
  loginId: string,
  payload: RescheduleScheduleRangePayload,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/range?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "일정 기간을 저장하지 못했습니다."));
  }
}

export async function deleteScheduleTaskRange(
  loginId: string,
  payload: DeleteScheduleTaskRangePayload,
): Promise<void> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/range?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "일정을 삭제하지 못했습니다."));
  }
}
