import { useRef, useState } from "react";
import { cancelFinanceCash, correctFinanceCash, createFinanceCash, type CashKind, type CashPayload, type FinanceBalance, type FinanceCash } from "../api/financeApi";
import { HistoryDialog } from "../components/AssignmentHistoryModal";
import { createRetryIdentity, formatMoney, localDate, sumMoney, validateAllocations } from "../domain/finance";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { Field, MoneyInput } from "./financeControls";
import { cashAllocationLabel } from "./financeCashLabels";
import styles from "./FinancePage.module.css";

export const cashKindLabels: Record<CashKind, string> = { RECEIPT: "수납", PAYOUT: "지급", DIRECT: "직접 지급 확인" };
type Target = { uuid: string; label: string; balance: string };

export function cashTargets(balances: FinanceBalance[], kind: CashKind, partyKey: string, original?: FinanceCash): Target[] {
  const targets = new Map(balances.filter(row => row.kind === kind && row.partyKey === partyKey).map(row => [row.uuid, { uuid: row.uuid, label: `${row.workDate} · ${row.siteName} · ${row.partyName}`, balance: row.outstandingAmount }]));
  if (original && !original.cancelled) for (const allocation of original.allocations) {
    const current = targets.get(allocation.obligationUuid);
    targets.set(allocation.obligationUuid, { uuid: allocation.obligationUuid, label: cashAllocationLabel(allocation, balances.find(row => row.uuid === allocation.obligationUuid)), balance: sumMoney([current?.balance ?? "0", allocation.amount]) });
  }
  return [...targets.values()];
}

export function FinanceCashModal({ loginId, kind, partyKey, partyName, balances, original, action = "create", onClose, onSaved }: {
  loginId: string; kind: CashKind; partyKey: string; partyName: string; balances: FinanceBalance[];
  original?: FinanceCash; action?: "create" | "correct" | "cancel"; onClose: () => void; onSaved: () => void;
}) {
  const targets = cashTargets(balances, kind, partyKey, action === "correct" ? original : undefined);
  const initialValues = Object.fromEntries((action === "correct" ? original?.allocations ?? [] : []).map(row => [row.obligationUuid, row.amount]));
  const [allocations, setAllocations] = useState<Record<string, string>>(initialValues);
  const [cashDate, setCashDate] = useState(original?.cashDate ?? localDate());
  const [method, setMethod] = useState<CashPayload["method"]>(original?.method ?? "TRANSFER");
  const [memo, setMemo] = useState(original?.memo ?? "");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<{ payload: CashPayload; reason: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const retry = useRef(createRetryIdentity());
  const initial = useRef(JSON.stringify({ allocations: initialValues, cashDate: original?.cashDate ?? localDate(), method: original?.method ?? "TRANSFER", memo: original?.memo ?? "", reason: "" }));
  const isDirty = JSON.stringify({ allocations, cashDate, method, memo, reason }) !== initial.current;
  const confirmDiscard = useUnsavedChangesGuard(isDirty);
  const close = () => { if (!inFlight.current && confirmDiscard()) onClose(); };
  const selected = targets.filter(row => BigInt(allocations[row.uuid] || "0") > 0n);
  const total = sumMoney(selected.map(row => allocations[row.uuid]));

  const preparePreview = () => {
    try {
      if (action !== "create" && !reason.trim()) throw new Error("원본을 보존할 취소·정정 사유를 입력하세요.");
      if (action !== "cancel") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(cashDate)) throw new Error("기록일을 입력하세요.");
        validateAllocations(selected.map(row => ({ amount: allocations[row.uuid], balance: row.balance })));
      }
      setError("");
      setPreview({ payload: { kind, partyKey, cashDate, amount: total, method, memo: memo.trim() || null, allocations: selected.map(row => ({ obligationUuid: row.uuid, amount: allocations[row.uuid] })) }, reason: reason.trim() });
    } catch (caught) { setError((caught as Error).message); }
  };
  const submit = async () => {
    if (!preview || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    const requestId = retry.current.forPayload({ action, originalUuid: original?.uuid, ...preview });
    try {
      if (action === "cancel" && original) await cancelFinanceCash(loginId, original.uuid, requestId, preview.reason);
      else if (action === "correct" && original) await correctFinanceCash(loginId, original.uuid, requestId, preview.reason, preview.payload);
      else await createFinanceCash(loginId, requestId, preview.payload);
      onSaved(); onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "기록하지 못했습니다. 동일 내용은 안전하게 다시 시도할 수 있습니다."); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <HistoryDialog title={`${cashKindLabels[kind]} ${action === "cancel" ? "취소" : action === "correct" ? "정정" : "기록"}`} onClose={close}><div className={styles.form} inert={busy ? true : undefined}>
    <h3>{original?.partyName?.trim() || partyName}</h3><p className={styles.notice}>{kind === "DIRECT" ? "농가가 작업자에게 직접 지급한 사실의 확인 기록입니다. 사무소 입출금이나 은행 송금이 아닙니다." : "실제 입출금 사실을 기록합니다. 은행 송금은 실행하지 않습니다."}</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {preview ? <>
      <h3>{action === "cancel" ? "취소 확인" : "배분 확인"}</h3>
      {action !== "cancel" ? <><p>{preview.payload.cashDate} · {preview.payload.method === "TRANSFER" ? "계좌이체" : preview.payload.method === "CASH" ? "현금" : "기타"}</p><div className={styles.list}>{preview.payload.allocations.map(row => <div className={styles.rowHeading} key={row.obligationUuid}><span>{targets.find(target => target.uuid === row.obligationUuid)?.label}</span><strong>{formatMoney(row.amount)}</strong></div>)}</div><p className={styles.total}>합계 {formatMoney(preview.payload.amount)}</p>{preview.payload.memo ? <p>{preview.payload.memo}</p> : null}</> : <p>원본 {formatMoney(original?.amount)} 기록을 취소하고 배분 잔액을 복원합니다.</p>}
      {preview.reason ? <p>사유: {preview.reason}</p> : null}
      <div className={styles.actions}><button className={styles.secondary} disabled={busy} type="button" onClick={() => setPreview(null)}>입력 수정</button><button className={styles.primary} disabled={busy} type="button" onClick={() => void submit()}>{busy ? "처리 중" : action === "cancel" ? "취소 확정" : "배분 확인·기록"}</button></div>
    </> : <>
      {action !== "cancel" ? <><div className={styles.fields}><Field label={kind === "DIRECT" ? "직접 지급일" : kind === "RECEIPT" ? "수납일" : "지급일"}><input type="date" value={cashDate} onChange={event => setCashDate(event.target.value)} /></Field><Field label="수단"><select value={method} onChange={event => setMethod(event.target.value as CashPayload["method"])}><option value="TRANSFER">계좌이체</option><option value="CASH">현금</option><option value="OTHER">기타</option></select></Field></div>
      <div className={styles.rowHeading}><h3>동일 대상 내역별 배분</h3><button className={styles.secondary} type="button" onClick={() => setAllocations(Object.fromEntries(targets.filter(row => BigInt(row.balance) > 0n).map(row => [row.uuid, row.balance])))}>잔액 전액 선택</button></div>
      {targets.length ? targets.map(row => <div className={styles.item} key={row.uuid}><div><strong>{row.label}</strong><p className={styles.muted}>{action === "correct" ? "기존 배분 복원 후 가능 잔액" : "미정산 잔액"} {formatMoney(row.balance)}</p></div><MoneyInput label="이번 배분액 · 비우면 제외" value={allocations[row.uuid] ?? null} onChange={amount => setAllocations(current => ({ ...current, [row.uuid]: amount ?? "" }))} /></div>) : <p className={styles.empty}>배분할 잔액이 없습니다.</p>}
      <p className={styles.total}>기록 합계 {formatMoney(total)}</p><Field label="메모 · 농가 입금 대기 등"><textarea value={memo} onChange={event => setMemo(event.target.value)} /></Field></> : null}
      {action !== "create" ? <><p className={styles.notice}>원본 기록과 기존 배분은 삭제하지 않고 취소·정정 이력을 남깁니다.</p><Field label="사유 *"><textarea value={reason} onChange={event => setReason(event.target.value)} /></Field></> : null}
      <button className={styles.primary} type="button" onClick={preparePreview}>{action === "cancel" ? "취소 내역 확인" : "배분 미리보기"}</button>
    </>}
  </div></HistoryDialog>;
}
