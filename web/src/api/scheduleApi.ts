import { getApiBaseUrl } from "./apiBaseUrl";
import type { ClientWorkSite } from "./clientsApi";
import type { WorkerSeparationRule } from "./workforceApi";

const apiBaseUrl = getApiBaseUrl();

export type ScheduleAssignmentArea = "men" | "women";

export type ScheduleAssignment = {
  assignmentUuid?: string;
  area: ScheduleAssignmentArea;
  assignmentStatus?: string;
  attendanceStatus?: string;
  displayName?: string;
  participantGroupUuid?: string;
  participantType?: "registered" | "guest";
  pickupLocation?: string;
  plannedEndTime?: string;
  plannedStartTime?: string;
  workerProfileUuid?: string | null;
  workerCount: number;
  noShowIncidentUuid?: string | null;
  noShowReplacementWorkerProfileUuid?: string | null;
  noShowReplacementAssignmentUuid?: string | null;
  noShowIncidentStatus?: string;
};

export type ScheduleTask = {
  address: string;
  assignments: ScheduleAssignment[];
  clientWorkSiteUuid: string | null;
  id: string;
  memo: string;
  ownerName: string;
  ownerUuid: string;
  requiredMen: number;
  requiredWomen: number;
  siteName: string;
  siteMemo: string;
  startTime: string;
  endTime: string;
  timeRange: string;
  title: string;
  workSiteId: string;
  workTypeCodes: string[];
};

type ScheduleTaskListResponse = {
  tasks: ScheduleTask[];
};

export type FarmOwnerOption = {
  profileUuid: string;
  uuid: string;
  displayName: string;
  name: string;
  nickname: string;
  businessName: string;
  phone: string;
  recentTitle: string;
  recentSiteName: string;
  recentAddress: string;
  recentStartTime: string | null;
  recentEndTime: string | null;
  workSites: ClientWorkSite[];
};

export type CreateScheduleTaskPayload = {
  address: string;
  clientWorkSiteUuid: string | null;
  endDate: string;
  endTime: string | null;
  memo: string;
  ownerUuid: string | null;
  ownerName: string;
  ownerNickname: string;
  ownerPhone: string;
  requiredMen: number;
  requiredWomen: number;
  siteName: string;
  siteMemo: string;
  startDate: string;
  startTime: string | null;
  title: string;
  workTypeCodes: string[];
};

export type UpdateScheduleTaskPayload = {
  acknowledgedSeparationRuleUuids?: string[];
  address: string;
  assignments: ScheduleAssignment[];
  clientWorkSiteUuid: string | null;
  endTime: string | null;
  memo: string;
  ownerUuid?: string | null;
  requiredMen: number;
  requiredWomen: number;
  siteMemo: string;
  siteName: string;
  startTime: string | null;
  title: string;
  workTypeCodes: string[];
};

export class WorkerSeparationConflictError extends Error {
  conflicts: WorkerSeparationRule[];

  constructor(message: string, conflicts: WorkerSeparationRule[]) {
    super(message);
    this.name = "WorkerSeparationConflictError";
    this.conflicts = conflicts;
  }
}

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

export type ReplaceNoShowPayload = {
  originalAssignmentUuid: string;
  replacementWorkerProfileUuid: string;
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
    { cache: "no-store" },
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
    if (response.status === 409) {
      const body = (await response.json()) as {
        code?: string;
        conflicts?: WorkerSeparationRule[];
        message?: string;
      };
      if (body.code === "WORKER_SEPARATION_CONFLICT") {
        throw new WorkerSeparationConflictError(
          body.message || "동시 배치 주의 작업자가 포함되어 있습니다.",
          body.conflicts ?? [],
        );
      }
      throw new Error(body.message || "작업 일정을 저장하지 못했습니다.");
    }
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

export async function updateGuestParticipants(
  loginId: string,
  workDate: string,
  taskId: string,
  participantGroupUuid: string,
  payload: AddGuestParticipantsPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/guest-participants/${participantGroupUuid}?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "미등록 작업자를 수정하지 못했습니다."));
  }
  return (await response.json()) as ScheduleTask;
}

export async function deleteGuestParticipants(
  loginId: string,
  workDate: string,
  taskId: string,
  participantGroupUuid: string,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/guest-participants/${participantGroupUuid}?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "미등록 작업자를 삭제하지 못했습니다."));
  }
  return (await response.json()) as ScheduleTask;
}

export async function replaceNoShow(
  loginId: string,
  workDate: string,
  taskId: string,
  payload: ReplaceNoShowPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/no-show-replacement?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "노쇼 대체 인원을 저장하지 못했습니다."));
  }
  return (await response.json()) as ScheduleTask;
}

export async function changeNoShowReplacement(
  loginId: string,
  workDate: string,
  taskId: string,
  payload: ReplaceNoShowPayload,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/no-show-replacement?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "노쇼 대체 작업자를 변경하지 못했습니다."));
  }
  return (await response.json()) as ScheduleTask;
}

export async function cancelNoShow(
  loginId: string,
  workDate: string,
  taskId: string,
  originalAssignmentUuid: string,
): Promise<ScheduleTask> {
  const response = await fetch(
    `${apiBaseUrl}/api/schedule/tasks/${taskId}/no-show-replacement/${originalAssignmentUuid}?loginId=${encodeURIComponent(loginId)}&workDate=${encodeURIComponent(workDate)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "노쇼 처리를 취소하지 못했습니다."));
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
