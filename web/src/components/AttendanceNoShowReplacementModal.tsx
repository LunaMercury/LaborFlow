import { useEffect, useMemo, useRef, useState } from "react";
import type { AttendanceRecord } from "../api/attendanceApi";
import {
  AssignmentCautionConflictError,
  mergeCautionAcknowledgements,
  type AssignmentCaution,
  type CautionAcknowledgement,
} from "../api/assignmentCautionsApi";
import {
  replaceNoShow,
  fetchScheduleTasks,
  type ScheduleAssignment,
  type ScheduleTask,
} from "../api/scheduleApi";
import { fetchWorkers } from "../api/workforceApi";
import type { WorkerRow } from "../data/workerRows";
import { AssignmentCautionDialog } from "./AssignmentCautionDialog";
import { HistoryDialog } from "./AssignmentHistoryModal";
import styles from "./AttendanceNoShowReplacementModal.module.css";

export type AttendanceNoShowReplacementModalProps = {
  loginId: string;
  record: AttendanceRecord;
  onClose: () => void;
  onSaved: () => void;
};

type NoShowMetadata = Pick<ScheduleAssignment,
  "noShowIncidentUuid" | "noShowIncidentStatus" | "noShowReplacementWorkerProfileUuid"
>;

function workerName(worker: WorkerRow) {
  return worker.name.trim() || worker.nickname?.trim() || "이름 없음";
}

function todayValue() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function AttendanceNoShowReplacementModal(props: AttendanceNoShowReplacementModalProps) {
  return <ReplacementContent key={JSON.stringify([
    props.loginId, props.record.workDate, props.record.scheduleDayUuid, props.record.assignmentUuid,
  ])} {...props} />;
}

function ReplacementContent({ loginId, record, onClose, onSaved }: AttendanceNoShowReplacementModalProps) {
  const [data, setData] = useState<{ workers: WorkerRow[]; tasks: ScheduleTask[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [replacementWorkerId, setReplacementWorkerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [caution, setCaution] = useState<{
    conflicts: AssignmentCaution[];
    acknowledged: CautionAcknowledgement[];
  } | null>(null);
  const inFlightRef = useRef(false);
  const completedRef = useRef(false);
  const mountedRef = useRef(false);
  const futureDate = record.workDate > todayValue();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    if (futureDate) {
      setLoading(false);
      return;
    }
    void Promise.all([fetchWorkers(loginId), fetchScheduleTasks(loginId, record.workDate)])
      .then(([workers, tasks]) => { if (active) setData({ workers, tasks }); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "대체 작업자 목록을 불러오지 못했습니다.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loginId, record.workDate, futureDate, loadAttempt]);

  const task = data?.tasks.find(item => item.id === record.scheduleDayUuid);
  const original = task?.assignments.find(item => item.assignmentUuid === record.assignmentUuid);
  const metadata = record as AttendanceRecord & NoShowMetadata;
  const incidentStatus = (original?.noShowIncidentStatus || metadata.noShowIncidentStatus)?.toUpperCase();
  const currentReplacementId = original?.noShowReplacementWorkerProfileUuid ?? metadata.noShowReplacementWorkerProfileUuid;
  const changing = Boolean(currentReplacementId) || incidentStatus === "REPLACED";
  const title = changing ? "대체자 변경" : "대체자 선택";
  const unavailable = futureDate ? "미래 날짜에는 대체자를 배정할 수 없습니다."
    : record.status === "CANCELLED" || original?.assignmentStatus?.toLowerCase() === "cancelled"
      ? "취소된 배정에는 대체자를 적용할 수 없습니다."
    : data && !task
      ? "대상 작업을 찾을 수 없습니다. 근태 목록을 새로 확인해 주세요."
      : "";

  const candidates = useMemo(() => {
    if (!data || !task || unavailable) return [];
    const assignedWorkerIds = new Set(data.tasks.flatMap(item => item.assignments
      .filter(assignment => !["replaced", "cancelled"].includes(assignment.assignmentStatus?.toLowerCase() ?? "planned"))
      .map(assignment => assignment.workerProfileUuid)));
    return data.workers
      .filter(worker => worker.isActive !== false && Boolean(worker.profileUuid)
        && worker.profileUuid !== record.workerProfileUuid && !assignedWorkerIds.has(worker.profileUuid))
      .map(worker => ({
        worker,
        matchingWorkTypeCount: worker.workTypeCodes.filter(code => task.workTypeCodes.includes(code)).length,
      }))
      .sort((left, right) => right.matchingWorkTypeCount - left.matchingWorkTypeCount
        || workerName(left.worker).localeCompare(workerName(right.worker), "ko-KR"));
  }, [data, task, record.workerProfileUuid, unavailable]);
  const visibleCandidates = useMemo(() => {
    const normalize = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    const query = normalize(search);
    return query ? candidates.filter(({ worker }) => [worker.name, worker.nickname ?? ""]
      .some(value => normalize(value).includes(query))) : [];
  }, [candidates, search]);
  const selected = candidates.find(item => item.worker.profileUuid === replacementWorkerId);
  const canSave = !loading && !unavailable && Boolean(task && selected);

  const close = () => { if (!inFlightRef.current && !caution) onClose(); };
  const save = async (acknowledgedCautions: CautionAcknowledgement[] = []) => {
    if (inFlightRef.current || completedRef.current || !canSave || !task) return;
    inFlightRef.current = true;
    setBusy(true);
    setError("");
    setCaution(null);
    try {
      await replaceNoShow(loginId, record.workDate, task.id, {
        originalAssignmentUuid: record.assignmentUuid,
        replacementWorkerProfileUuid: replacementWorkerId,
        acknowledgedCautions,
      });
    } catch (caught) {
      if (mountedRef.current) {
        if (caught instanceof AssignmentCautionConflictError && caught.conflicts.length > 0) {
          setCaution({ conflicts: caught.conflicts, acknowledged: acknowledgedCautions });
        } else {
          setError(caught instanceof Error ? caught.message : "대체 작업자를 저장하지 못했습니다.");
        }
      }
      return;
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
    completedRef.current = true;
    if (mountedRef.current) {
      onSaved();
      onClose();
    }
  };

  const currentWorker = currentReplacementId
    ? data?.workers.find(worker => worker.profileUuid === currentReplacementId) : undefined;
  const currentName = currentWorker ? workerName(currentWorker)
    : currentReplacementId ? task?.assignments.find(item => item.workerProfileUuid === currentReplacementId)?.displayName : undefined;

  return <>
    <HistoryDialog title={title} onClose={close} inactive={Boolean(caution)}>
      <div className={styles.body} aria-busy={busy || loading}>
        {error || unavailable ? <p className={styles.error} role="alert">{error || unavailable}</p> : null}
        <p className={styles.summary}>{record.workDate} · {record.workTitle} / {record.ownerName}</p>
        <p className={styles.summary}>대체 대상: {record.displayName}</p>
        {changing ? <p className={styles.currentAssignment}>현재 대체자: {currentName || "배정됨"}</p> : null}
        {loading ? <p role="status">대체 작업자를 불러오는 중입니다.</p> : null}
        {!loading && !data && !unavailable ? <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>다시 불러오기</button> : null}
        <input aria-label="대체 작업자 이름 또는 호칭 검색" className={styles.searchInput}
          type="search" placeholder="이름 또는 호칭 검색" value={search}
          disabled={loading || busy || Boolean(caution) || Boolean(unavailable) || !data}
          onChange={event => { setSearch(event.target.value); setReplacementWorkerId(""); }} />
        {search.trim() && !loading && data && !unavailable ? <div className={styles.candidates}>
          {!loading && data && !unavailable && visibleCandidates.length === 0 ? <p className={styles.summary} role="status">
            {candidates.length === 0 ? "선택 가능한 미배정 작업자가 없습니다." : "검색 결과가 없습니다."}
          </p> : null}
          {visibleCandidates.map(candidate => <label className={styles.candidate} key={candidate.worker.profileUuid}>
            <input type="radio" name="no-show-replacement" value={candidate.worker.profileUuid}
              checked={replacementWorkerId === candidate.worker.profileUuid} disabled={busy || Boolean(caution)}
              onChange={() => setReplacementWorkerId(candidate.worker.profileUuid as string)} />
            <span className={styles.candidateDetails}>
              <strong>{workerName(candidate.worker)}</strong>
              {candidate.worker.name.trim() && candidate.worker.nickname?.trim() ? <small>{candidate.worker.nickname}</small> : null}
              <small>일치 작업 {candidate.matchingWorkTypeCount}개 · {candidate.worker.pickupLocation || "승차장소 없음"}</small>
            </span>
          </label>)}
        </div> : null}
        {selected ? <p className={styles.summary} role="status">선택한 대체자: <strong>{workerName(selected.worker)}</strong></p> : null}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={close}>닫기</button>
          <button className={styles.saveButton} type="button" disabled={busy || Boolean(caution) || !canSave} onClick={() => void save()}>
            {busy ? "적용 중" : "대체 적용"}
          </button>
        </div>
      </div>
    </HistoryDialog>
    {caution ? <AssignmentCautionDialog cautions={caution.conflicts} busy={busy}
      onClose={() => { if (!inFlightRef.current) setCaution(null); }}
      onConfirm={() => {
        if (inFlightRef.current) return;
        const acknowledgements = caution.conflicts.map(({ uuid, updatedAt }) => ({ uuid, updatedAt }));
        void save(mergeCautionAcknowledgements(caution.acknowledged, acknowledgements));
      }} /> : null}
  </>;
}
