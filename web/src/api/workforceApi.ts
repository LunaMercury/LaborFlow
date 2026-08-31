import type { WorkTypeOption } from "../data/workTypeOptions";
import type { WorkerRow } from "../data/workerRows";
import { getApiBaseUrl } from "./apiBaseUrl";

const apiBaseUrl = getApiBaseUrl();

type WorkerListResponse = {
  workers: WorkerRow[];
};

export type CreateWorkerPayload = {
  age: number | null;
  gender: string;
  localNickname: string;
  memo: string;
  isActive: boolean;
  availableDaysMask: number;
  availabilityMemo: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  noShowRisk: boolean;
  phone: string;
  pickupLocation: string;
  workTypeCodes: string[];
  workTypeRatings: Record<string, number>;
  workerName: string;
};

export type UpdateWorkerProfilePayload = {
  age: number | null;
  gender: string;
  memo: string;
  isActive: boolean;
  availableDaysMask: number;
  availabilityMemo: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  noShowRisk: boolean;
  name: string;
  nickname: string;
  phone: string;
  pickupLocation: string;
  workTypeCodes: string[];
  workTypeRatings: Record<string, number>;
  separationRules: WorkerSeparationRulePayload[];
};

export type WorkerSeparationRulePayload = {
  otherWorkerProfileUuid: string;
  reason: string;
};

export type WorkerSeparationRule = {
  ruleUuid: string;
  workerProfileUuidA: string;
  workerNameA: string;
  workerProfileUuidB: string;
  workerNameB: string;
  reason: string;
};

export type CreateWorkerTeamPayload = {
  teamName: string;
  workerProfileUuids: string[];
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

export async function fetchWorkerSeparationRules(
  loginId: string,
): Promise<WorkerSeparationRule[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-separation-rules?loginId=${encodeURIComponent(loginId)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("동시 배치 주의 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as WorkerSeparationRule[];
}

export async function createWorkerTeam(
  loginId: string,
  payload: CreateWorkerTeamPayload,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-teams?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "팀을 구성하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerTeam(
  loginId: string,
  teamUuid: string,
  payload: CreateWorkerTeamPayload,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-teams/${teamUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "팀을 수정하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function deleteWorkerTeam(
  loginId: string,
  teamUuid: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-teams/${teamUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "팀을 삭제하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerWorkTypes(
  loginId: string,
  profileUuid: string,
  workTypeCodes: string[],
  workTypeRatings: Record<string, number>,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/work-types?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ workTypeCodes, workTypeRatings }),
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

async function parseErrorMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function createWorker(
  loginId: string,
  payload: CreateWorkerPayload,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/workers?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "작업자를 등록하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function createWorkerFromGuestAssignment(
  loginId: string,
  assignmentUuid: string,
  payload: CreateWorkerPayload,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/workers/from-guest-assignment/${assignmentUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error("미등록 참여자를 작업자로 등록하지 못했습니다.");
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerIdentity(
  loginId: string,
  profileUuid: string,
  name: string,
  nickname: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/identity?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ name, nickname }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "이름 정보를 저장하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerProfile(
  loginId: string,
  profileUuid: string,
  payload: UpdateWorkerProfilePayload,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "작업자 정보를 저장하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function deleteWorkerProfile(
  loginId: string,
  profileUuid: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}?loginId=${encodeURIComponent(loginId)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "작업자를 삭제하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerPhone(
  loginId: string,
  profileUuid: string,
  phone: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/phone?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ phone }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "전화번호를 저장하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerPickupLocation(
  loginId: string,
  profileUuid: string,
  pickupLocation: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/pickup-location?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ pickupLocation }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "승차장소를 저장하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}

export async function updateWorkerGender(
  loginId: string,
  profileUuid: string,
  gender: string,
): Promise<WorkerRow[]> {
  const response = await fetch(
    `${apiBaseUrl}/api/workforce/worker-profiles/${profileUuid}/gender?loginId=${encodeURIComponent(loginId)}`,
    {
      body: JSON.stringify({ gender }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "성별을 저장하지 못했습니다."));
  }

  const body = (await response.json()) as WorkerListResponse;
  return body.workers;
}
