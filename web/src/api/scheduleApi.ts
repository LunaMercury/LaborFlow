const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5581";

export type ScheduleAssignmentArea = "men" | "women";

export type ScheduleAssignment = {
  area: ScheduleAssignmentArea;
  workerProfileUuid: string;
  workerCount: number;
};

export type ScheduleTask = {
  address: string;
  assignments: ScheduleAssignment[];
  id: string;
  memo: string;
  ownerName: string;
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

export type UpdateScheduleTaskPayload = {
  address: string;
  assignments: ScheduleAssignment[];
  memo: string;
  requiredMen: number;
  requiredWomen: number;
  title: string;
  workTypeCodes: string[];
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
