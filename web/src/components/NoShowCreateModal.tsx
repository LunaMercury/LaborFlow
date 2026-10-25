import { useEffect, useRef, useState } from "react";
import type { AttendanceRecord } from "../api/attendanceApi";
import { createNoShowIncident } from "../api/noShowApi";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { HistoryDialog } from "./AssignmentHistoryModal";
import shared from "./AssignmentHistoryModal.module.css";
import styles from "./NoShowCreateModal.module.css";

export type NoShowCreateModalProps = {
  loginId: string;
  record: AttendanceRecord;
  onClose: () => void;
  onSaved: () => void;
};

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function NoShowCreateModal(props: NoShowCreateModalProps) {
  return <NoShowCreateContent key={JSON.stringify([
    props.loginId, props.record.assignmentUuid, props.record.workDate,
  ])} {...props} />;
}

function NoShowCreateContent({ loginId, record, onClose, onSaved }: NoShowCreateModalProps) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isFutureDate = record.workDate > todayInSeoul();
  const confirmDiscard = useUnsavedChangesGuard(note.length > 0, "작성 중인 노쇼 메모를 버리고 닫을까요?");

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const close = () => {
    if (!inFlight.current && confirmDiscard()) onClose();
  };

  const save = async () => {
    if (inFlight.current) return;
    if (record.workDate > todayInSeoul()) {
      setError("미래 날짜의 근태는 노쇼로 기록할 수 없습니다.");
      return;
    }
    if (note.length > 1000) {
      setError("메모는 1,000자 이내로 입력해 주세요.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await createNoShowIncident(loginId, { assignmentUuid: record.assignmentUuid, note: note.trim() || null });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "노쇼를 기록하지 못했습니다. 다시 시도해 주세요.");
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // Callback failures must not turn an already saved incident into a retryable write.
    try { onSaved(); } finally { onClose(); }
  };

  return <HistoryDialog title="노쇼 기록" onClose={close} dismissOnBackdrop>
    <div className={`${shared.body} ${styles.body}`} aria-busy={busy}>
      {error ? <p className={styles.error} ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
      <dl className={styles.facts}>
        <div><dt>작업자</dt><dd>{record.displayName || "익명 참여자"}</dd></div>
        <div><dt>근무일</dt><dd><time dateTime={record.workDate}>{record.workDate}</time></dd></div>
        <div><dt>현장</dt><dd>{record.siteName || "-"}</dd></div>
      </dl>
      <p className={styles.notice}>근태가 결근(ABSENT)으로 변경되고, 별도의 노쇼 이력이 즉시 저장됩니다.</p>
      {isFutureDate ? <p className={styles.error} role="status">미래 날짜의 근태는 노쇼로 기록할 수 없습니다.</p> : null}
      <label className={styles.noteField}>
        메모 (선택)
        <textarea disabled={busy} maxLength={1000} rows={4} tabIndex={0} value={note}
          onChange={event => setNote(event.target.value)} />
      </label>
      <div className={styles.actions}>
        <button disabled={busy} type="button" onClick={close}>취소</button>
        <button className={shared.applyButton} disabled={busy || isFutureDate} type="button" onClick={() => void save()}>
          {busy ? "기록 중…" : "노쇼 기록"}
        </button>
      </div>
    </div>
  </HistoryDialog>;
}
