import type { AssignmentCaution, WorkerAssignmentCautionChange } from "../api/assignmentCautionsApi";

export type CautionEditorRule = Pick<AssignmentCaution,
  "uuid" | "workerProfileUuid" | "clientProfileUuid" | "workerName" | "clientName" | "requestedBy" | "memo">;

export function buildWorkerCautionChanges(initial: CautionEditorRule[], current: CautionEditorRule[]): WorkerAssignmentCautionChange[] {
  const normalizeMemo = (memo: string | null) => memo?.trim() || null;
  const changes: WorkerAssignmentCautionChange[] = initial
    .filter(rule => !current.some(next => next.clientProfileUuid === rule.clientProfileUuid))
    .map(rule => ({ uuid: rule.uuid, clientProfileUuid: rule.clientProfileUuid, released: true }));
  for (const rule of current) {
    const previous = initial.find(item => item.clientProfileUuid === rule.clientProfileUuid);
    if (!previous || previous.requestedBy !== rule.requestedBy || normalizeMemo(previous.memo) !== normalizeMemo(rule.memo)) {
      changes.push({ uuid: previous?.uuid ?? null, clientProfileUuid: rule.clientProfileUuid,
        requestedBy: rule.requestedBy, memo: normalizeMemo(rule.memo), released: false });
    }
  }
  return changes;
}
