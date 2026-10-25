import { useEffect, useRef, useState } from "react";
import { fetchFinanceBalances, fetchFinanceCash, fetchFinanceDetail, fetchFinanceWork, type BalanceList, type CashKind, type FinanceBalance, type FinanceCash, type FinanceWork, type WorkList } from "../api/financeApi";
import { StatusSnackbar } from "../components/StatusSnackbar";
import { DateNavigation } from "../components/DateNavigation";
import { isValidDateInput } from "../components/dateNavigationHelpers";
import { dueLabel, formatMoney, localDate, matchesDueDate, sumMoney, type DueFilter } from "../domain/finance";
import { FinanceWorkEditor } from "./FinanceWorkEditor";
import { FinanceSettingsModal } from "./FinanceSettingsModal";
import { cashKindLabels, FinanceCashModal } from "./FinanceCashModal";
import { FinanceCashHistory } from "./FinanceCashHistory";
import { cashRecordName } from "./financeCashLabels";
import { Field } from "./financeControls";
import styles from "./FinancePage.module.css";

type Tab = "profit" | "receipts" | "payouts";
const dueFilters: { value: DueFilter; label: string }[] = [{ value: "ALL", label: "전체 잔액" }, { value: "TODAY", label: "오늘 예정" }, { value: "OVERDUE", label: "기한 경과" }, { value: "FUTURE", label: "향후 예정" }];
function balanceStatusLabel(status: FinanceBalance["status"], kind: CashKind) {
  if (status === "OVERPAID") return "초과 정산 · 정정 필요";
  const labels = kind === "RECEIPT" ? { UNPAID: "미수납", PARTIAL: "일부 수납", PAID: "수납 완료" }
    : kind === "PAYOUT" ? { UNPAID: "미지급", PARTIAL: "일부 지급", PAID: "지급 완료" }
    : { UNPAID: "지급 확인 필요", PARTIAL: "일부 지급 확인", PAID: "지급 확인 완료" };
  return labels[status];
}
const workStatusLabels = { UNPREPARED: "초안 미생성", DRAFT: "금액 미확정", CONFIRMED: "금액 확정" };
type CashModalState = { kind: CashKind; partyKey: string; partyName: string; original?: FinanceCash; action: "create" | "correct" | "cancel" };

export function FinancePage({ loginId, onNavigate }: { loginId: string; onNavigate: (path: string) => void }) {
  const [today] = useState(() => localDate());
  const [initialQuery] = useState(() => new URLSearchParams(window.location.search));
  const queryDate = initialQuery.get("workDate");
  const initialDate = queryDate && isValidDateInput(queryDate) ? queryDate : null;
  const [tab, setTab] = useState<Tab>("profit");
  const [fromDate, setFromDate] = useState(initialDate ?? `${today.slice(0, 7)}-01`);
  const [toDate, setToDate] = useState(initialDate ?? today);
  const [cashFromDate, setCashFromDate] = useState(`${today.slice(0, 7)}-01`);
  const [cashToDate, setCashToDate] = useState(today);
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [works, setWorks] = useState<WorkList | null>(null);
  const [balances, setBalances] = useState<BalanceList | null>(null);
  const [cash, setCash] = useState<FinanceCash[]>([]);
  const [cashLoading, setCashLoading] = useState(false);
  const [workLoading, setWorkLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [workError, setWorkError] = useState("");
  const [balanceError, setBalanceError] = useState("");
  const [cashError, setCashError] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("ALL");
  const [direct, setDirect] = useState(false);
  const [selectedWork, setSelectedWork] = useState<FinanceWork | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cashModal, setCashModal] = useState<CashModalState | null>(null);
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState(false);
  const deepLinkOpened = useRef(false);
  const kind: CashKind = tab === "receipts" ? "RECEIPT" : direct ? "DIRECT" : "PAYOUT";
  const refresh = () => setReload(value => value + 1);

  useEffect(() => {
    let active = true;
    setWorkError(""); setWorkLoading(true); setWorks(null);
    if (!isValidDateInput(fromDate) || !isValidDateInput(toDate) || fromDate > toDate) { setWorkError("작업 조회 시작일과 종료일을 확인하세요."); setWorkLoading(false); return; }
    void fetchFinanceWork(loginId, fromDate, toDate).then(result => {
      if (!active) return;
      setWorks(result);
      const day = initialQuery.get("scheduleDayUuid");
      if (day && !deepLinkOpened.current) {
        deepLinkOpened.current = true;
        const target = result.items.find(work => work.scheduleDayUuid === day);
        if (target) setSelectedWork(target); else setStatus("해당 날짜에서 작업을 찾지 못했습니다. 조회 기간과 근태를 확인하세요.");
      }
    }).catch(caught => { if (active) setWorkError((caught as Error).message); }).finally(() => { if (active) setWorkLoading(false); });
    return () => { active = false; };
  }, [loginId, fromDate, toDate, reload, initialQuery]);

  useEffect(() => {
    if (tab === "profit") return;
    let active = true;
    setBalances(null); setBalanceError(""); setBalanceLoading(true);
    void fetchFinanceBalances(loginId, kind, "ALL").then(result => { if (active) setBalances(result); }).catch(caught => { if (active) setBalanceError((caught as Error).message); }).finally(() => { if (active) setBalanceLoading(false); });
    return () => { active = false; };
  }, [loginId, kind, tab, reload]);

  useEffect(() => {
    if (tab === "profit") return;
    let active = true;
    setCash([]); setCashError(""); setCashLoading(true);
    if (!cashFromDate || !cashToDate || cashFromDate > cashToDate) { setCashError("입출금 조회 시작일과 종료일을 확인하세요."); setCashLoading(false); return; }
    void fetchFinanceCash(loginId, kind, cashFromDate, cashToDate).then(result => { if (active) setCash(result.items); }).catch(caught => { if (active) setCashError((caught as Error).message); }).finally(() => { if (active) setCashLoading(false); });
    return () => { active = false; };
  }, [loginId, kind, tab, cashFromDate, cashToDate, reload]);

  const openWork = async (work: FinanceWork | FinanceBalance) => {
    if (opening) return;
    setOpening(true);
    try {
      if ("workUuid" in work) setSelectedWork(await fetchFinanceDetail(loginId, work.workUuid));
      else setSelectedWork(work.uuid ? await fetchFinanceDetail(loginId, work.uuid) : work);
    } catch (caught) { setStatus((caught as Error).message); } finally { setOpening(false); }
  };
  const groupedBalances = new Map<string, FinanceBalance[]>();
  for (const row of balances?.items ?? []) {
    if (!matchesDueDate(row.dueDate, dueFilter, today)) continue;
    if (search && !`${row.partyName} ${row.clientName} ${row.siteName}`.includes(search)) continue;
    groupedBalances.set(row.partyKey, [...(groupedBalances.get(row.partyKey) ?? []), row]);
  }
  const workItems = (works?.items ?? []).filter(work => {
    const identity = work.snapshot ?? work.currentSource;
    return (!search || `${identity?.clientName} ${identity?.siteName} ${identity?.workTitle}`.includes(search)) && (!attentionOnly || work.status !== "CONFIRMED" || work.reviewRequired);
  });
  const partyName = (partyKey: string) => balances?.items.find(row => row.partyKey === partyKey)?.partyName ?? works?.items.flatMap(work => work.snapshot?.lines ?? []).find(line => line.payeeKey === partyKey)?.displayName ?? works?.items.find(work => work.snapshot?.clientUuid === partyKey)?.snapshot?.clientName ?? partyKey;
  const cashTotal = sumMoney(cash.filter(record => !record.cancelled).map(record => record.amount));

  return <main className={styles.financePage}>
    <header className={styles.financePageHeader}><h1>수익·정산</h1><div className={styles.financeActionGroup}><button className={styles.financeSecondaryButton} type="button" onClick={() => setSettingsOpen(true)}>기본값·지급 주기</button><button className={styles.financeSecondaryButton} type="button" onClick={refresh}>새로고침</button></div></header>
    <div className={styles.financeTabBar} role="tablist" aria-label="수익·정산 영역">{([{ key: "profit", label: "수익 현황" }, { key: "receipts", label: "농가 수납" }, { key: "payouts", label: "작업자 지급" }] as const).map(item => <button id={`finance-${item.key}-tab`} aria-controls="finance-panel" key={item.key} role="tab" aria-selected={tab === item.key} type="button" onClick={() => { setTab(item.key); setSearch(""); setDueFilter("ALL"); }}>{item.label}</button>)}</div>
    <div id="finance-panel" role="tabpanel" aria-labelledby={`finance-${tab}-tab`} className={styles.financeRecordList}>
    {tab === "profit" ? <>
      <DateNavigation className={styles.financeDateNavigation} from={fromDate} to={toDate} today={today} onChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      <div className={styles.financeFilterOptions} aria-label="작업 기간"><button aria-pressed={fromDate === `${today.slice(0, 7)}-01` && toDate === today} type="button" onClick={() => { setFromDate(`${today.slice(0, 7)}-01`); setToDate(today); }}>이번 달</button></div>
      {workError ? <p className={styles.financeErrorMessage} role="alert">{workError}</p> : null}
      {workLoading ? <p role="status">작업 실적을 불러오는 중입니다.</p> : works ? <>
        <div className={styles.financeSummaryGrid}><div className={styles.financeSummaryMetric}><span>확정 사무소 청구액</span><strong>{formatMoney(works.summary.officeCharge)}</strong></div><div className={styles.financeSummaryMetric}><span>확정 작업이익</span><strong>{formatMoney(works.summary.workProfit)}</strong></div><div className={styles.financeSummaryMetric}><span>직접 지급 · 사무소 비용 제외</span><strong>{formatMoney(works.summary.directPay)}</strong></div></div>
        <div className={styles.financeRowHeader}><span>금액 확정 {works.summary.confirmedCount}건</span><span className={styles.financeWarningText}>미확정 {works.summary.unconfirmedCount}건</span><span className={styles.financeWarningText}>재확인 필요 {works.summary.reviewCount}건</span></div><p className={styles.financeSecondaryText}>현장별 투입 누계 {works.summary.workerDayCount}건 · 기간 내 등록 고유 작업자 {works.summary.uniqueWorkerCount}명 · 익명 근태 {works.summary.guestAttendanceCount}건</p>
        <p className={styles.financeNoticeMessage}>작업일 기준 확정 금액입니다. 미수·미지급 여부는 작업이익을 바꾸지 않으며, 사무실 고정비·세금 등을 차감한 순이익은 아닙니다.</p>
      </> : null}
      <Field label="거래처·현장·작업 검색"><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field><label className={styles.financeCheckboxField}><input type="checkbox" checked={attentionOnly} onChange={event => setAttentionOnly(event.target.checked)} />금액 미확정·재확인 필요만</label>
      <div className={styles.financeRecordList}>{workItems.map(work => { const identity = work.snapshot ?? work.currentSource; const grouped = work.currentSource?.assignments.some(row => row.workerCount > 1 && row.attendanceStatus === "WORKED"); return <button className={`${styles.financeRecordCard} ${styles.financeRecordButton}`} type="button" disabled={opening} key={work.scheduleDayUuid} onClick={() => void openWork(work)}><div className={styles.financeRowHeader}><strong>{identity?.clientName ?? "과거 작업"} · {identity?.workTitle}</strong><span className={styles.financeStatusBadge}>{workStatusLabels[work.status]}</span></div><span className={styles.financeSecondaryText}>{identity?.workDate} · {identity?.siteName}</span><div className={styles.financeRowHeader}><span>작업이익 {work.status === "CONFIRMED" ? formatMoney(work.totals.workProfit) : "금액 미확정"}</span>{work.reviewRequired ? <span className={styles.financeWarningText}>금액 재확인 필요</span> : null}</div>{grouped ? <span className={styles.financeWarningText}>개인별 분리·근태 확인 필요</span> : work.sourceStatus === "ATTENDANCE_UNCONFIRMED" ? <span className={styles.financeWarningText}>근태 미확정</span> : null}</button>; })}</div>
      {!workLoading && !workError && !workItems.length ? <p className={styles.financeEmptyState}>조회 기간에 해당하는 작업이 없습니다.</p> : null}
    </> : <>
      {tab === "payouts" ? <div className={styles.financeFilterOptions}><button aria-pressed={!direct} type="button" onClick={() => setDirect(false)}>사무소 지급</button><button aria-pressed={direct} type="button" onClick={() => setDirect(true)}>농가 직접 지급 확인</button></div> : null}
      <h2>{kind === "RECEIPT" ? "농가 미수금" : kind === "PAYOUT" ? "작업자 미지급금" : "직접 지급 확인 필요"}</h2>
      <p className={styles.financeSecondaryText}>작업 기간과 무관한 전체 잔액 · 예정일 미정은 전체 목록에 포함</p>
      {balanceError ? <p className={styles.financeErrorMessage} role="alert">{balanceError}</p> : null}
      {balanceLoading ? <p role="status">전체 잔액을 불러오는 중입니다.</p> : balances ? <div className={styles.financeSummaryGrid}><div className={styles.financeSummaryMetric}><span>잔액 내역 확정액</span><strong>{formatMoney(balances.totalAmount)}</strong></div><div className={styles.financeSummaryMetric}><span>{kind === "DIRECT" ? "직접 지급 확인액" : "기록된 정산액"}</span><strong>{formatMoney(balances.totalSettled)}</strong></div><div className={styles.financeSummaryMetric}><span>전체 남은 금액</span><strong>{formatMoney(balances.totalOutstanding)}</strong></div></div> : null}
      <div className={styles.financeFilterOptions} aria-label="예정일 필터">{dueFilters.map(filter => <button aria-pressed={dueFilter === filter.value} type="button" key={filter.value} onClick={() => setDueFilter(filter.value)}>{filter.label}</button>)}</div><Field label="대상·현장 검색"><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
      {[...groupedBalances].map(([partyKey, rows]) => <section className={styles.financeRecordCard} key={partyKey}><div className={styles.financeRowHeader}><h3>{rows[0].partyName}</h3><strong>{formatMoney(sumMoney(rows.map(row => row.outstandingAmount)))}</strong></div><button className={styles.financePrimaryButton} disabled={balanceLoading || !rows.some(row => BigInt(row.outstandingAmount) > 0n)} type="button" onClick={() => setCashModal({ kind, partyKey, partyName: rows[0].partyName, action: "create" })}>{cashKindLabels[kind]} 기록</button><details><summary>날짜·현장별 {rows.length}건</summary><div className={styles.financeRecordList}>{rows.map(row => <div className={styles.financeFormSection} key={row.uuid}><div className={styles.financeRowHeader}><strong>{row.workDate} · {row.siteName}</strong><span className={row.reconciliationRequired ? styles.financeWarningText : styles.financeStatusBadge}>{balanceStatusLabel(row.status, kind)}</span></div><span className={row.overdue ? styles.financeWarningText : styles.financeSecondaryText}>{dueLabel(row.dueDate, today)}{row.originalDueDate !== row.dueDate ? ` · 원예정일 ${row.originalDueDate ?? "미정"}` : ""}</span><span>확정 {formatMoney(row.amount)} · 정산 {formatMoney(row.settledAmount)} · 잔액 {formatMoney(row.outstandingAmount)}</span>{row.relatedReceiptOutstanding !== null && kind !== "RECEIPT" ? <span className={styles.financeSecondaryText}>관련 농가 미수 {formatMoney(row.relatedReceiptOutstanding)} · 작업자 지급과 별도</span> : null}{row.reconciliationRequired ? <p className={styles.financeErrorMessage}>초과 수납·지급 확인 필요. 기존 기록을 정정하거나 금액을 재확인하세요.</p> : null}<button className={styles.financeSecondaryButton} type="button" disabled={opening} onClick={() => void openWork(row)}>작업 금액·예정일 확인</button></div>)}</div></details></section>)}
      {!balanceLoading && !balanceError && !groupedBalances.size ? <p className={styles.financeEmptyState}>해당 조건의 잔액이 없습니다.</p> : null}
      <section className={styles.financeFormSection}><h2>{kind === "DIRECT" ? "농가 직접 지급 확인 내역" : "실제 입출금 기록"}</h2><div className={styles.financeDateFilters}><Field label={`${kind === "DIRECT" ? "직접 지급일" : kind === "RECEIPT" ? "수납일" : "지급일"} 시작`}><input type="date" value={cashFromDate} onChange={event => setCashFromDate(event.target.value)} /></Field><Field label="종료"><input type="date" value={cashToDate} onChange={event => setCashToDate(event.target.value)} /></Field></div>
        {cashError ? <p className={styles.financeErrorMessage} role="alert">{cashError}</p> : cashLoading ? <p role="status">기록을 불러오는 중입니다.</p> : <><p className={styles.financeTotalAmount}>{kind === "DIRECT" ? "직접 지급 확인 합계" : "기간 내 실제 기록 합계"} {formatMoney(cashTotal)}</p><FinanceCashHistory records={cash} balances={balances?.items ?? []} nameForParty={partyName} correctionDisabled={balanceLoading || !!balanceError} onAction={(record, action) => setCashModal({ kind: record.kind, partyKey: record.partyKey, partyName: cashRecordName(record, partyName), original: record, action })} />{!cash.length ? <p className={styles.financeEmptyState}>해당 기간의 기록이 없습니다.</p> : null}</>}
      </section>
    </>}
    </div>
    {selectedWork ? <FinanceWorkEditor key={selectedWork.uuid ?? selectedWork.scheduleDayUuid} loginId={loginId} initialWork={selectedWork} onClose={() => setSelectedWork(null)} onSaved={() => { refresh(); setStatus("작업 금액을 저장했습니다."); }} onNavigate={path => { setSelectedWork(null); onNavigate(path); }} /> : null}
    {settingsOpen ? <FinanceSettingsModal loginId={loginId} onClose={() => setSettingsOpen(false)} onSaved={() => { refresh(); setStatus("기본값을 저장했습니다. 기존 작업 내역은 유지됩니다."); }} /> : null}
    {cashModal ? <FinanceCashModal {...cashModal} loginId={loginId} balances={balances?.items ?? []} onClose={() => setCashModal(null)} onSaved={() => { refresh(); setStatus("정산 기록을 저장했습니다."); }} /> : null}
    <StatusSnackbar message={status} onDismiss={() => setStatus("")} />
  </main>;
}
