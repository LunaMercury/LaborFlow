import { getApiBaseUrl } from "./apiBaseUrl";
import { parseErrorMessage } from "./parseErrorMessage";

export type NoShowIncidentStatus = "OPEN" | "REPLACED" | "CANCELLED";
export type NoShowRevision = {
  action: "CREATED" | "REPLACEMENT_CHANGED" | "NOTE_UPDATED" | "CANCELLED";
  note: string | null;
  createdAt: string;
  performedByAccountUuid: string | null;
};
export type NoShowIncident = {
  uuid: string;
  originalAssignmentUuid: string;
  scheduleDayUuid: string;
  workDate: string;
  workerProfileUuid: string | null;
  workerName: string;
  ownerName: string;
  siteName: string;
  workTitle: string;
  status: NoShowIncidentStatus;
  note: string | null;
  replacementWorkerProfileUuid: string | null;
  replacementWorkerName: string | null;
  replacementAssignmentUuid: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  revisions: NoShowRevision[];
};
export type NoShowFilters = { workerProfileUuid?: string; workDate?: string };
export type CreateNoShowIncidentPayload = { assignmentUuid: string; note?: string | null };

const base = `${getApiBaseUrl()}/api/no-show/incidents`;
export const noShowsChangedEvent = "laborflow:no-shows-changed";

export function notifyNoShowsChanged() {
  window.dispatchEvent(new Event(noShowsChangedEvent));
  try {
    localStorage.setItem(noShowsChangedEvent, `${Date.now()}:${Math.random()}`);
  } catch { /* Same-tab refresh remains available when storage is blocked. */ }
}

export function subscribeNoShowsChanged(refresh: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === noShowsChangedEvent) refresh();
  };
  window.addEventListener(noShowsChangedEvent, refresh);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(noShowsChangedEvent, refresh);
    window.removeEventListener("storage", storage);
  };
}

function validateNote(note: string | null | undefined) {
  if (note != null && note.length > 1000) throw new Error("메모는 1,000자 이내로 입력해 주세요.");
}

export async function fetchNoShowIncidents(loginId: string, filters: NoShowFilters): Promise<NoShowIncident[]> {
  if (!filters.workerProfileUuid?.trim() && !filters.workDate?.trim()) {
    throw new Error("작업자 또는 근무일을 지정해 주세요.");
  }
  const query = new URLSearchParams({ loginId });
  if (filters.workerProfileUuid) query.set("workerProfileUuid", filters.workerProfileUuid);
  if (filters.workDate) query.set("workDate", filters.workDate);
  const response = await fetch(`${base}?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "노쇼 이력을 불러오지 못했습니다."));
  const body = await response.json() as { incidents: NoShowIncident[] };
  return body.incidents;
}

async function writeIncident(loginId: string, path: string, method: "POST" | "PATCH", body: object) {
  const response = await fetch(`${base}${path}?${new URLSearchParams({ loginId })}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "노쇼 이력을 변경하지 못했습니다."));
  notifyNoShowsChanged();
}

// Mutation response bodies are not required; callers refresh through the list endpoint/event.
export async function createNoShowIncident(loginId: string, payload: CreateNoShowIncidentPayload): Promise<void> {
  validateNote(payload.note);
  await writeIncident(loginId, "", "POST", payload);
}

export async function updateNoShowIncidentNote(loginId: string, uuid: string, note: string | null): Promise<void> {
  validateNote(note);
  await writeIncident(loginId, `/${encodeURIComponent(uuid)}`, "PATCH", { note });
}

export async function cancelNoShowIncident(loginId: string, uuid: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("취소 사유를 입력해 주세요.");
  if (reason.length > 1000) throw new Error("취소 사유는 1,000자 이내로 입력해 주세요.");
  await writeIncident(loginId, `/${encodeURIComponent(uuid)}/cancel`, "POST", { reason: reason.trim() });
}
