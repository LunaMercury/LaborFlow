import { HistoryDialog } from "./AssignmentHistoryModal";
import { cautionRequesterLabels, type AssignmentCaution } from "../api/assignmentCautionsApi";
import styles from "./AssignmentCautionEditor.module.css";

export function AssignmentCautionDialog({ cautions, onClose, onConfirm, busy = false }: {
  cautions: AssignmentCaution[]; onClose: () => void; onConfirm?: () => void; busy?: boolean;
}) {
  return <HistoryDialog title="배치 주의" dismissOnBackdrop onClose={() => { if (!busy) onClose(); }}>
    <div className={styles.section}>
      <p>이 거래처의 모든 현장에 적용됩니다.</p>
      {cautions.map(c => <div className={styles.rule} key={c.uuid}><div>
        <strong>{c.workerName} · {c.clientName}</strong>
        <span>요청 주체: {cautionRequesterLabels[c.requestedBy]}</span>
        {c.memo ? <p>{c.memo}</p> : null}
      </div></div>)}
      {onConfirm ? <><p>내용을 확인한 뒤 배치하시겠습니까? 드롭 시에는 초안에만 반영되며 작업 카드의 체크 버튼으로 저장합니다.</p><div className={styles.actions}>
        <button type="button" disabled={busy} onClick={onClose}>취소</button>
        <button type="button" disabled={busy} onClick={onConfirm}>{busy ? "처리 중" : "확인 후 배치"}</button>
      </div></> : null}
    </div>
  </HistoryDialog>;
}
