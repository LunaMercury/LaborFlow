import { useEffect, useRef, useState } from "react";
import { fetchAttendanceRecords, type AttendanceRecord } from "../api/attendanceApi";
import { fetchFinanceDetail, prepareFinanceWork, saveFinanceWork, type FinanceExtra, type FinanceLine, type FinanceSnapshot, type FinanceWork } from "../api/financeApi";
import { HistoryDialog } from "../components/AssignmentHistoryModal";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { applyDefaults, attendanceTime, formatMoney, newFinanceUuid, quantityAmount } from "../domain/finance";
import { Field, ModeInput, MoneyInput, QuantityInput } from "./financeControls";
import styles from "./FinancePage.module.css";

const attendanceLabels: Record<string, string> = { WORKED: "근무 확인", DRAFT: "근태 미확정", ABSENT: "결근", CANCELLED: "취소", UNRECORDED: "미기록" };
const statusLabels = { UNPREPARED: "초안 미생성", DRAFT: "금액 미확정", CONFIRMED: "금액 확정" };

export function FinanceWorkEditor({ loginId, initialWork, onClose, onSaved, onNavigate }: {
  loginId: string; initialWork: FinanceWork; onClose: () => void; onSaved: () => void; onNavigate: (path: string) => void;
}) {
  const [work, setWork] = useState(initialWork);
  const [draft, setDraft] = useState<FinanceSnapshot | null>(initialWork.snapshot);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [group, setGroup] = useState("ALL");
  const [overwrite, setOverwrite] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(work.snapshot);
  const confirmDiscard = useUnsavedChangesGuard(dirty);
  const source = work.currentSource;
  const identity = draft ?? source;
  const workDate = identity?.workDate ?? "";
  const needsIndividualAttendance = source?.assignments.some(assignment => assignment.workerCount !== 1) ?? false;
  const sourceChanged = work.reviewRequired || Boolean(draft && source && draft.sourceFingerprint !== source.fingerprint);

  useEffect(() => {
    let active = true;
    if (workDate) void fetchAttendanceRecords(loginId, workDate).then(result => { if (active) setRecords(result.records); }).catch(() => { if (active) setRecords([]); });
    return () => { active = false; };
  }, [loginId, workDate]);

  const close = () => { if (!inFlight.current && confirmDiscard()) onClose(); };
  const update = (values: Partial<FinanceSnapshot>) => setDraft(current => current ? { ...current, ...values } : current);
  const updateLine = (index: number, values: Partial<FinanceLine>) => setDraft(current => current ? { ...current, lines: current.lines.map((line, row) => row === index ? { ...line, ...values, override: true } : line) } : current);
  const updateExtra = (index: number, values: Partial<FinanceExtra>) => setDraft(current => current ? { ...current, extras: current.extras.map((extra, row) => row === index ? { ...extra, ...values } : extra) } : current);
  const run = async (action: () => Promise<FinanceWork>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { const next = await action(); setWork(next); setDraft(next.snapshot); setReason(""); setReviewed(false); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); }
    finally { setBusy(false); inFlight.current = false; }
  };

  const applyRates = () => {
    if (!draft) return;
    if (overwrite && !window.confirm("개별 수정한 금액과 지급 방식도 기본값으로 덮어쓸까요?")) return;
    const rows = draft.lines.map(line => ({ ...line, overridden: line.override }));
    const applied = applyDefaults(rows, {}, line => group === "ALL" || records.some(record => record.assignmentUuid === line.assignmentUuid && record.area === group), overwrite);
    update({ lines: applied.map((line, index) => line !== rows[index] ? {
      ...draft.lines[index], mode: draft.defaultMode, chargeRate: draft.defaultChargeRate, payRate: draft.defaultPayRate,
      chargeAmount: quantityAmount(draft.defaultChargeRate, line.quantity), payAmount: quantityAmount(draft.defaultPayRate, line.quantity), override: false,
    } : draft.lines[index]) });
  };

  const save = (confirm: boolean) => {
    if (!draft || !work.uuid || !source) return;
    if (sourceChanged && !reviewed) { setError("현재 근태와 기존 금액을 비교한 후 재확인을 표시하세요."); return; }
    if (work.status === "CONFIRMED" && !reason.trim()) { setError("확정 금액·예정일 변경 사유를 입력하세요."); return; }
    if (confirm && !window.confirm(work.status === "CONFIRMED" ? "수정한 금액과 예정일을 확정하고 변경 이력을 남길까요? 기존 입출금은 유지됩니다." : "모든 작업자 금액과 추가 항목을 확인하고 확정할까요?")) return;
    void run(() => saveFinanceWork(loginId, work.uuid!, {
      version: work.version, status: confirm || work.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT", reason: reason.trim() || null,
      sourceFingerprint: source.fingerprint, defaultMode: draft.defaultMode, defaultChargeRate: draft.defaultChargeRate,
      defaultPayRate: draft.defaultPayRate, receiptDueDate: draft.receiptDueDate, lines: draft.lines.map(({ assignmentUuid, mode, quantity, chargeRate, payRate, chargeAmount, payAmount, override, payoutDueDate, note }) => ({ assignmentUuid, mode, quantity, chargeRate, payRate, chargeAmount, payAmount, override, payoutDueDate, note })), extras: draft.extras, note: draft.note,
    }));
  };

  return <HistoryDialog title="작업 금액 확인" onClose={close}><div className={styles.form} inert={busy ? true : undefined}>
    <div><h3>{identity?.workTitle} · {identity?.clientName}</h3><p className={styles.muted}>{workDate} · {identity?.siteName}</p></div>
    <div className={styles.actions}><span className={styles.badge}>{statusLabels[work.status]}</span>{work.reviewRequired ? <span className={styles.warning}>금액 재확인 필요</span> : null}</div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {needsIndividualAttendance ? <p className={styles.error} role="alert">개인별 분리·근태 확인 필요: 여러 명으로 묶인 기존 배치를 개인별로 분리하고 실제 근태를 확인한 뒤 금액을 확정하세요.</p> : null}
    {source ? <section className={styles.section}><h3>현재 실제 근태</h3>{source.assignments.map(assignment => <div className={styles.rowHeading} key={assignment.assignmentUuid}><strong>{assignment.displayName}{assignment.workerCount > 1 ? ` · ${assignment.workerCount}명 묶음` : ""}</strong><span className={styles.muted}>{attendanceLabels[assignment.attendanceStatus] ?? assignment.attendanceStatus} · {attendanceTime(assignment.actualStartAt)} ~ {attendanceTime(assignment.actualEndAt)} · 휴게 {assignment.breakMinutes ?? "미입력"}분</span></div>)}
      <button className={styles.secondary} type="button" disabled={busy} onClick={() => { if (confirmDiscard()) onNavigate(`/attendance?workDate=${encodeURIComponent(workDate)}`); }}>근태 확인</button>
    </section> : <p className={styles.warning}>원본 근태를 조회할 수 없습니다. 과거 확정 기록은 유지됩니다.</p>}
    {!draft ? <><p className={styles.notice}>{work.sourceStatus === "ATTENDANCE_UNCONFIRMED" ? "근태 미확정 · 실제 근무 결과를 먼저 확인하세요." : work.sourceStatus === "NO_WORKED_ATTENDANCE" ? "확인된 실제 근무 내역이 없습니다." : "확인한 실제 근무 내역으로 정산 초안을 생성합니다."}</p><button className={styles.primary} disabled={busy || needsIndividualAttendance || work.sourceStatus !== "READY"} type="button" onClick={() => void run(() => prepareFinanceWork(loginId, work.scheduleDayUuid))}>{busy ? "생성 중" : "근태 기반 초안 생성"}</button></> : <>
      {draft.defaultMode === "DIRECT" || draft.lines.some(line => line.mode === "DIRECT") ? <p className={styles.notice}>직접 지급분은 농가가 작업자에게 지급할 금액입니다. 사무소 비용·입출금에서 제외되며, 사무소에는 소개료만 청구합니다. 실제 지급 여부는 별도로 확인합니다.</p> : null}
      {sourceChanged ? <p className={styles.notice}>근태 변경으로 기존 금액을 자동 삭감하지 않습니다. 아래 금액과 현재 근태를 비교하세요. 인원 변경은 명시적으로 반영해야 합니다.</p> : null}<button className={styles.secondary} disabled={busy} type="button" onClick={async () => {
        if (!work.uuid || !window.confirm("최신 근태를 조회하고 확인된 근무자 목록을 반영할까요? 기존 작업자의 금액은 유지하고 새 작업자는 미입력으로 추가합니다.")) return;
        setBusy(true);
        try {
          const latest = await fetchFinanceDetail(loginId, work.uuid);
          if (latest.version !== work.version) {
            if (window.confirm("다른 사용자가 이 작업 금액을 변경했습니다. 미저장 입력을 버리고 서버의 최신 금액을 불러올까요?")) {
              setWork(latest); setDraft(latest.snapshot); setReviewed(false); setReason("");
            }
            return;
          }
          const actual = latest.currentSource?.assignments.filter(item => item.confirmed && item.attendanceStatus === "WORKED") ?? [];
          setWork(latest);
          update({ lines: actual.map(assignment => { const old = draft.lines.find(line => line.assignmentUuid === assignment.assignmentUuid); return old ? { ...old, ...assignment } : { ...assignment, mode: draft.defaultMode, quantity: 1, chargeRate: null, payRate: null, chargeAmount: null, payAmount: null, override: false, payoutDueDate: null, note: null }; }) });
          setReviewed(false);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "근태 조회 실패"); } finally { setBusy(false); }
      }}>최신 근태와 명단 맞추기</button>{sourceChanged ? <label className={styles.check}><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />현재 근태와 기존 금액을 비교했습니다</label> : null}
      <section className={styles.section}><h3>현장 기본값</h3><ModeInput value={draft.defaultMode} onChange={defaultMode => update({ defaultMode })} /><div className={styles.fields}><MoneyInput label={draft.defaultMode === "DIRECT" ? "사무소 소개료 단가" : "농가 청구 단가"} value={draft.defaultChargeRate} onChange={defaultChargeRate => update({ defaultChargeRate })} /><MoneyInput label={draft.defaultMode === "DIRECT" ? "농가 직접 지급 단가" : "작업자 지급 단가"} value={draft.defaultPayRate} onChange={defaultPayRate => update({ defaultPayRate })} /></div>
      <Field label="기본값 적용 대상"><select value={group} onChange={event => setGroup(event.target.value)}><option value="ALL">전체 작업자</option><option value="men">남성 배치 그룹</option><option value="women">여성 배치 그룹</option></select></Field><label className={styles.check}><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)} />개별 수정값도 덮어쓰기</label><button className={styles.secondary} type="button" disabled={busy || (group !== "ALL" && records.length === 0)} onClick={applyRates}>기본값 적용</button></section>
      <section className={styles.section}><h3>작업자별 금액</h3>{draft.lines.map((line, index) => <div className={styles.item} key={line.assignmentUuid}><div className={styles.rowHeading}><strong>{line.displayName}</strong>{line.override ? <span className={styles.badge}>개별 수정</span> : null}</div><ModeInput value={line.mode} onChange={mode => updateLine(index, { mode })} />
        <div className={styles.fields}><QuantityInput value={line.quantity} onChange={quantity => updateLine(index, { quantity, chargeAmount: quantityAmount(line.chargeRate, quantity), payAmount: quantityAmount(line.payRate, quantity) })} /><Field label="지급예정일"><input type="date" value={line.payoutDueDate ?? ""} onChange={event => updateLine(index, { payoutDueDate: event.target.value || null })} /></Field>
        <MoneyInput label={line.mode === "DIRECT" ? "사무소 소개료 단가" : "농가 청구 단가"} value={line.chargeRate} onChange={chargeRate => updateLine(index, { chargeRate, chargeAmount: quantityAmount(chargeRate, line.quantity) })} /><MoneyInput label={line.mode === "DIRECT" ? "농가 직접 지급 단가" : "작업자 지급 단가"} value={line.payRate} onChange={payRate => updateLine(index, { payRate, payAmount: quantityAmount(payRate, line.quantity) })} />
        <MoneyInput label={line.mode === "DIRECT" ? "최종 사무소 소개료" : "최종 농가 청구액"} value={line.chargeAmount} onChange={chargeAmount => updateLine(index, { chargeAmount })} /><MoneyInput label={line.mode === "DIRECT" ? "농가 직접 지급 확인 대상액" : "최종 작업자 지급액"} value={line.payAmount} onChange={payAmount => updateLine(index, { payAmount })} /></div><Field label="작업자 메모"><input value={line.note ?? ""} onChange={event => updateLine(index, { note: event.target.value || null })} /></Field></div>)}</section>
      <section className={styles.section}><h3>추가 청구·사무소 비용</h3>{draft.extras.map((extra, index) => <div className={styles.item} key={extra.uuid}><div className={styles.fields}><Field label="항목명"><input value={extra.name} onChange={event => updateExtra(index, { name: event.target.value })} /></Field><Field label="계산 기준"><select value={extra.basis} onChange={event => updateExtra(index, { basis: event.target.value as FinanceExtra["basis"] })}><option value="PER_PERSON">인당</option><option value="PER_JOB">건별</option></select></Field><QuantityInput value={extra.quantity} onChange={quantity => updateExtra(index, { quantity, chargeAmount: quantityAmount(extra.chargeRate, quantity), costAmount: quantityAmount(extra.costRate, quantity) })} /><MoneyInput label="농가 청구 단가" value={extra.chargeRate} onChange={chargeRate => updateExtra(index, { chargeRate, chargeAmount: quantityAmount(chargeRate, extra.quantity) })} /><MoneyInput label="사무소 비용 단가" value={extra.costRate} onChange={costRate => updateExtra(index, { costRate, costAmount: quantityAmount(costRate, extra.quantity) })} /><MoneyInput label="최종 농가 청구액" value={extra.chargeAmount} onChange={chargeAmount => updateExtra(index, { chargeAmount })} /><MoneyInput label="최종 사무소 부담 비용" value={extra.costAmount} onChange={costAmount => updateExtra(index, { costAmount })} /></div><button className={styles.danger} type="button" disabled={busy} onClick={() => update({ extras: draft.extras.filter(item => item.uuid !== extra.uuid) })}>항목 삭제</button></div>)}<button className={styles.secondary} type="button" disabled={busy} onClick={() => update({ extras: [...draft.extras, { uuid: newFinanceUuid(), name: "", basis: "PER_JOB", quantity: 1, chargeRate: null, costRate: null, chargeAmount: null, costAmount: null }] })}>추가 항목</button></section>
      <Field label="농가 수납예정일 · 비우면 미정"><input type="date" value={draft.receiptDueDate ?? ""} onChange={event => update({ receiptDueDate: event.target.value || null })} /></Field><Field label="작업 메모"><textarea value={draft.note ?? ""} onChange={event => update({ note: event.target.value || null })} /></Field>
      {work.status === "CONFIRMED" ? <Field label="확정 금액·예정일 변경 사유 *"><textarea value={reason} onChange={event => setReason(event.target.value)} /></Field> : null}
      <p className={styles.muted}>서버 저장 합계 · 사무소 청구 {formatMoney(work.totals.officeCharge)} / 지급 {formatMoney(work.totals.officePay)} / 추가 비용 {formatMoney(work.totals.extraCost)} / 작업이익 {formatMoney(work.totals.workProfit)} / 직접 지급 {formatMoney(work.totals.directPay)}</p>
      <div className={styles.actions}>{work.status !== "CONFIRMED" ? <button className={styles.secondary} disabled={busy || !source || needsIndividualAttendance} type="button" onClick={() => save(false)}>초안 저장</button> : null}<button className={styles.primary} disabled={busy || !source || needsIndividualAttendance} type="button" onClick={() => save(true)}>{busy ? "저장 중" : work.status === "CONFIRMED" ? "수정 확정" : "금액 확인·확정"}</button></div>
    </>}
    {work.revisions.length ? <details><summary>확정·수정 이력 {work.revisions.length}건</summary><ol className={styles.audit}>{work.revisions.map(revision => <li key={revision.version}>{revision.changedAt} · v{revision.version} · {revision.reason || "최초 저장"}<div>수납예정 {revision.snapshot.receiptDueDate ?? "미정"} · {revision.snapshot.lines.map(line => `${line.displayName}: ${formatMoney(line.payAmount)} (${line.payoutDueDate ?? "예정일 미정"})`).join(", ")}</div></li>)}</ol></details> : null}
  </div></HistoryDialog>;
}
