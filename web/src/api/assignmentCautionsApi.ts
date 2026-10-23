import { getApiBaseUrl } from "./apiBaseUrl";
import { parseErrorMessage } from "./parseErrorMessage";

export type CautionRequester = "CLIENT" | "WORKER" | "BOTH";
export type AssignmentCaution = {
  uuid: string; workerProfileUuid: string; clientProfileUuid: string; farmOwnerUuid: string;
  workerName: string; clientName: string; requestedBy: CautionRequester; memo: string | null;
  createdAt: string; updatedAt: string; createdByAccountUuid: string | null; updatedByAccountUuid: string | null;
};
export type CautionAcknowledgement = Pick<AssignmentCaution, "uuid" | "updatedAt">;
export type CautionPayload = Pick<AssignmentCaution, "workerProfileUuid" | "clientProfileUuid" | "requestedBy" | "memo">;
export type WorkerAssignmentCautionChange = {
  uuid: string | null;
  clientProfileUuid: string;
  requestedBy?: CautionRequester;
  memo?: string | null;
  released: boolean;
};
export const cautionRequesterLabels: Record<CautionRequester, string> = {
  CLIENT: "거래처 요청", WORKER: "작업자 요청", BOTH: "양측",
};
export function mergeCautionAcknowledgements(previous: CautionAcknowledgement[], next: CautionAcknowledgement[]) {
  return [...previous.filter(a => !next.some(b => b.uuid === a.uuid)), ...next];
}
const base = `${getApiBaseUrl()}/api/assignment-cautions`;
export const cautionsChangedEvent = "laborflow:assignment-cautions-changed";

export function notifyCautionsChanged() {
  window.dispatchEvent(new Event(cautionsChangedEvent));
  try { localStorage.setItem(cautionsChangedEvent, String(Date.now())); } catch { /* Same-tab refresh still works. */ }
}

export function subscribeCautionsChanged(refresh: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === cautionsChangedEvent) refresh(); };
  const visible = () => { if (document.visibilityState === "visible") refresh(); };
  window.addEventListener(cautionsChangedEvent, refresh);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", visible);
  return () => {
    window.removeEventListener(cautionsChangedEvent, refresh);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", visible);
  };
}

export async function fetchAssignmentCautions(loginId: string, filters: {
  workerProfileUuid?: string; clientProfileUuid?: string; farmOwnerUuid?: string;
} = {}): Promise<AssignmentCaution[]> {
  const query = new URLSearchParams({ loginId, ...filters });
  const response = await fetch(`${base}?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "배치 주의 관계를 불러오지 못했습니다. 다시 시도해 주세요."));
  return await response.json() as AssignmentCaution[];
}

export async function saveAssignmentCaution(loginId: string, payload: CautionPayload, uuid?: string): Promise<AssignmentCaution> {
  const response = await fetch(`${base}${uuid ? `/${encodeURIComponent(uuid)}` : ""}?${new URLSearchParams({ loginId })}`, {
    method: uuid ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "배치 주의 관계를 저장하지 못했습니다."));
  const caution = await response.json() as AssignmentCaution;
  notifyCautionsChanged();
  return caution;
}

export async function releaseAssignmentCaution(loginId: string, uuid: string) {
  const response = await fetch(`${base}/${encodeURIComponent(uuid)}?${new URLSearchParams({ loginId })}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "배치 주의 관계를 해제하지 못했습니다."));
  notifyCautionsChanged();
}

export class AssignmentCautionConflictError extends Error {
  constructor(message: string, public conflicts: AssignmentCaution[]) {
    super(message); this.name = "AssignmentCautionConflictError";
  }
}
export async function throwIfCautionConflict(response: Response): Promise<never> {
  const body = await response.json() as { code?: string; message?: string; conflicts?: AssignmentCaution[] };
  if (body.code === "ASSIGNMENT_CAUTION_CONFLICT") throw new AssignmentCautionConflictError(body.message || "배치 주의 관계를 확인해 주세요.", body.conflicts ?? []);
  throw new Error(body.message || "배치를 저장하지 못했습니다.");
}
