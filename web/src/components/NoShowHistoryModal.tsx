import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelNoShowIncident,
  fetchNoShowIncidents,
  subscribeNoShowsChanged,
  updateNoShowIncidentNote,
  type NoShowIncident,
  type NoShowIncidentStatus,
  type NoShowRevision,
} from "../api/noShowApi";
import { HistoryDialog } from "./AssignmentHistoryModal";
import { StatusSnackbar } from "./StatusSnackbar";
import shared from "./AssignmentHistoryModal.module.css";
import styles from "./NoShowHistoryModal.module.css";

export type NoShowHistoryModalProps = {
  loginId: string;
  workerProfileUuid?: string;
  workDate?: string;
  assignmentUuid?: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

const statusLabels: Record<NoShowIncidentStatus, string> = {
  OPEN: "노쇼", REPLACED: "대체 배정", CANCELLED: "취소됨",
};
const actionLabels: Record<NoShowRevision["action"], string> = {
  CREATED: "노쇼 등록", REPLACEMENT_CHANGED: "대체 배정 변경",
  NOTE_UPDATED: "메모 수정", CANCELLED: "노쇼 취소",
};

export function NoShowHistoryModal(props: NoShowHistoryModalProps) {
  return <NoShowHistoryContent key={JSON.stringify([
    props.loginId, props.workerProfileUuid, props.workDate, props.assignmentUuid,
  ])} {...props} />;
}

function NoShowHistoryContent({ loginId, workerProfileUuid, workDate, assignmentUuid, onClose, onChanged }: NoShowHistoryModalProps) {
  const [incidents, setIncidents] = useState<NoShowIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ uuid: string; note: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ uuid: string; reason: string; confirmed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const version = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const next = await fetchNoShowIncidents(loginId, { workerProfileUuid, workDate });
      if (!mounted.current || current !== version.current) return;
      const visible = assignmentUuid ? next.filter(item => item.originalAssignmentUuid === assignmentUuid) : next;
      setIncidents(visible);
      setEditing(current => current && visible.some(item => item.uuid === current.uuid) ? current : null);
      setCancelling(current => current && visible.some(item => item.uuid === current.uuid && item.status !== "CANCELLED") ? current : null);
    } catch (caught) {
      if (mounted.current && current === version.current) {
        setError(caught instanceof Error ? caught.message : "노쇼 이력을 불러오지 못했습니다.");
      }
    } finally {
      if (mounted.current && current === version.current) setLoading(false);
    }
  }, [loginId, workerProfileUuid, workDate, assignmentUuid]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const unsubscribe = subscribeNoShowsChanged(() => {
      if (!busyRef.current) void refresh();
    });
    return () => { mounted.current = false; version.current++; unsubscribe(); };
  }, [refresh]);

  const close = () => {
    if (busyRef.current) return;
    const original = incidents.find(item => item.uuid === editing?.uuid);
    const dirty = editing && editing.note !== (original?.note ?? "");
    if ((dirty || cancelling?.reason.trim()) && !window.confirm("작성 중인 메모 또는 취소 사유를 버리고 닫을까요?")) return;
    onClose();
  };

  const run = async (action: () => Promise<void>, success: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      if (!mounted.current) return;
      setEditing(null);
      setCancelling(null);
      setMessage(success);
      await refresh();
      try {
        await onChanged?.();
      } catch {
        if (mounted.current) setError("노쇼 변경은 저장되었지만 작업자 정보를 새로 불러오지 못했습니다.");
      }
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "노쇼 이력을 변경하지 못했습니다.");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <HistoryDialog title="노쇼 이력 관리" onClose={close} dismissOnBackdrop>
    <div className={`${shared.body} ${styles.body}`} aria-busy={busy || loading}>
      <p className={shared.notice}>노쇼 메모 저장과 취소는 즉시 반영됩니다. 작업자 정보의 저장·취소와는 별개입니다.</p>
      {error ? <div className={styles.error} role="alert">
        <p>{error}</p><button disabled={busy || loading} type="button" onClick={() => void refresh()}>다시 조회</button>
      </div> : null}
      {loading ? <p role="status">이력을 불러오는 중입니다.</p> : null}
      {!loading && !error && incidents.length === 0 ? <p>등록된 노쇼 이력이 없습니다.</p> : null}
      <div className={styles.list} inert={busy || loading ? true : undefined}>
        {incidents.map(incident => {
          const isEditing = editing?.uuid === incident.uuid;
          const isCancelling = cancelling?.uuid === incident.uuid;
          const cancelled = incident.status === "CANCELLED";
          return <article className={styles.incident} key={incident.uuid}>
            <header className={styles.identity}>
              <div><time dateTime={incident.workDate}>{incident.workDate}</time><strong>{incident.workerName || "익명 참여자"}</strong></div>
              <span className={cancelled ? styles.cancelled : styles.status}>{statusLabels[incident.status]}</span>
            </header>
            <dl className={styles.facts}>
              <div><dt>거래처</dt><dd>{incident.ownerName || "-"}</dd></div>
              <div><dt>현장</dt><dd>{incident.siteName || "-"}</dd></div>
              <div><dt>작업</dt><dd>{incident.workTitle || "-"}</dd></div>
              {incident.replacementWorkerName ? <div><dt>대체 작업자</dt><dd>{incident.replacementWorkerName}</dd></div> : null}
            </dl>
            {isEditing && editing ? <div className={styles.editor}>
              <label>노쇼 메모
                <textarea autoFocus maxLength={1000} rows={3} tabIndex={0} value={editing.note}
                  onChange={event => setEditing({ ...editing, note: event.target.value })} />
              </label>
              <div className={styles.actions}>
                <button type="button" onClick={() => setEditing(null)}>편집 취소</button>
                <button className={shared.applyButton} disabled={editing.note === (incident.note ?? "")} type="button"
                  onClick={() => void run(() => updateNoShowIncidentNote(loginId, incident.uuid, editing.note.trim() || null), "노쇼 메모를 저장했습니다.")}>메모 저장</button>
              </div>
            </div> : <p className={styles.note}><strong>메모</strong>{incident.note || "메모 없음"}</p>}
            {!isEditing && !isCancelling ? <div className={styles.actions}>
              <button disabled={Boolean(editing || cancelling)} type="button" onClick={() => setEditing({ uuid: incident.uuid, note: incident.note ?? "" })}>메모 수정</button>
              {!cancelled ? <button className={styles.cancelButton} disabled={Boolean(editing || cancelling)} type="button"
                onClick={() => setCancelling({ uuid: incident.uuid, reason: "", confirmed: false })}>노쇼 취소</button> : null}
            </div> : null}
            {isCancelling && cancelling && !cancelled ? <div className={styles.editor}>
              <p>원래 배정과 근태 상태를 복원하고, 노쇼 처리로 생성된 대체 기록만 숨깁니다. 취소 이력은 남습니다.</p>
              <label>취소 사유 (필수)
                <textarea autoFocus maxLength={1000} required rows={3} tabIndex={0} value={cancelling.reason}
                  onChange={event => setCancelling({ ...cancelling, reason: event.target.value, confirmed: false })} />
              </label>
              <label className={styles.confirmation}>
                <input type="checkbox" checked={cancelling.confirmed}
                  onChange={event => setCancelling({ ...cancelling, confirmed: event.target.checked })} />
                기존 배정·근태 복원과 노쇼 취소를 확인했습니다.
              </label>
              <div className={styles.actions}>
                <button type="button" onClick={() => setCancelling(null)}>돌아가기</button>
                <button className={styles.cancelButton} disabled={!cancelling.reason.trim() || !cancelling.confirmed} type="button"
                  onClick={() => void run(() => cancelNoShowIncident(loginId, incident.uuid, cancelling.reason), "노쇼를 취소했습니다. 취소 이력은 유지됩니다.")}>노쇼 취소 확정</button>
              </div>
            </div> : null}
            {incident.revisions.length ? <details className={styles.revisions}>
              <summary tabIndex={0}>변경 이력 ({incident.revisions.length})</summary>
              <ol>{incident.revisions.map((revision, index) => <li key={`${revision.createdAt}:${index}`}>
                <span>{actionLabels[revision.action] ?? revision.action}</span>
                <time dateTime={revision.createdAt}>{revision.createdAt.replace("T", " ")}</time>
                {revision.note ? <p>{revision.note}</p> : null}
              </li>)}</ol>
            </details> : null}
          </article>;
        })}
      </div>
    </div>
    <StatusSnackbar message={message} onDismiss={() => setMessage("")} />
  </HistoryDialog>;
}
