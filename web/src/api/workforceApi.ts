import type { WorkTypeOption } from "../data/workTypeOptions";
import type { WorkerRow } from "../data/workerRows";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5581";

type WorkerListResponse = {
  workers: WorkerRow[];
};

export async function fetchWorkers(loginId: string): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/workers?loginId=${encodeURIComponent(loginId)}`,
  );

  if (!response.ok) {
    throw new Error("작업자 목록을 불러오지 못했습니다.");
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function fetchWorkTypes(): Promise<WorkTypeOption[]> {
  const response = await fetch(`${apiBaseUrl}/api/workforce/work-types`);

  if (!response.ok) {
    throw new Error("작업 유형을 불러오지 못했습니다.");
  }

  return (await response.json()) as WorkTypeOption[];
}

export async function updateWorkerWorkTypes(
  loginId: string,
  profileUuid: string,
  workTypeCodes: string[],
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/work-types?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ workTypeCodes }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    throw new Error("가능한 작업을 저장하지 못했습니다.");
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}
