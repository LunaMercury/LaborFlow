import { useRef, useState } from "react";
import {
  fetchFinanceDetail,
  prepareFinanceWork,
  saveFinanceWork,
  type FinanceLine,
  type FinanceSnapshot,
  type FinanceWork,
} from "../api/financeApi";
import { HistoryDialog } from "../components/AssignmentHistoryModal";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { formatMoney } from "../domain/finance";
import { applyMissingScheduleRates } from "../domain/scheduleFinanceRates";
import {
  editableFinanceSnapshot,
  financePreviewTotals,
  mergeNewFinanceEdits,
} from "../domain/financeWorkPreview";
import {
  billingBreakdown,
  type FinanceAmountSection,
} from "../domain/financeWorkPresentation";
import { Field } from "./financeControls";
import { FinanceWorkerAmountTable } from "./FinanceWorkerAmountTable";
import {
  FinanceBulkAmountEditor,
  type FinanceBulkField,
} from "./FinanceBulkAmountEditor";
import { FinanceExtraAmountEditor } from "./FinanceExtraAmountEditor";
import { FinanceSettingsModal } from "./FinanceSettingsModal";
import styles from "./FinancePage.module.css";

const statusLabels = {
  UNPREPARED: "미저장",
  DRAFT: "금액 미확정",
  CONFIRMED: "금액 확정",
};

export function FinanceWorkEditor({
  loginId,
  initialWork,
  onClose,
  onSaved,
  onNavigate,
}: {
  loginId: string;
  initialWork: FinanceWork;
  onClose: () => void;
  onSaved: () => void;
  onNavigate: (path: string) => void;
}) {
  const [work, setWork] = useState(initialWork);
  const [draft, setDraft] = useState<FinanceSnapshot | null>(() =>
    editableFinanceSnapshot(initialWork),
  );
  const baseline = useRef(
    initialWork.snapshot ?? editableFinanceSnapshot(initialWork),
  );
  const [bulkField, setBulkField] = useState<FinanceBulkField | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [amountSection, setAmountSection] =
    useState<FinanceAmountSection>("billing");
  const [sortByName, setSortByName] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);
  const confirmDiscard = useUnsavedChangesGuard(dirty);
  const source = work.currentSource;
  const identity = draft ?? source;
  const workDate = identity?.workDate ?? "";
  const needsIndividualAttendance =
    source?.assignments.some((assignment) => assignment.workerCount !== 1) ??
    false;
  const sourceChanged =
    work.reviewRequired ||
    Boolean(draft && source && draft.sourceFingerprint !== source.fingerprint);
  const visibleLines = draft?.lines ?? [];
  const previewTotals = financePreviewTotals(visibleLines, draft?.extras ?? []);

  const close = () => {
    if (!inFlight.current && confirmDiscard()) onClose();
  };
  const update = (values: Partial<FinanceSnapshot>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));
  const updateLine = (index: number, values: Partial<FinanceLine>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line, row) =>
              row === index ? { ...line, ...values, override: true } : line,
            ),
          }
        : current,
    );
  const run = async (action: () => Promise<FinanceWork>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setWork(next);
      baseline.current = next.snapshot;
      setDraft(editableFinanceSnapshot(next));
      setReason("");
      setReviewed(false);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  const save = (confirm: boolean) => {
    if (!draft || !source) return;
    if (sourceChanged && !reviewed) {
      setError("현재 근태와 기존 금액을 비교한 후 재확인을 표시하세요.");
      return;
    }
    if (work.status === "CONFIRMED" && !reason.trim()) {
      setError("확정 금액·예정일 변경 사유를 입력하세요.");
      return;
    }
    if (
      confirm &&
      draft.lines.some(
        (line) => line.chargeAmount === null || line.payAmount === null,
      )
    ) {
      setError("청구 금액과 지급 금액을 입력한 뒤 확정해 주세요.");
      return;
    }
    if (
      confirm &&
      !window.confirm(
        work.status === "CONFIRMED"
          ? "수정한 금액과 예정일을 확정하고 변경 이력을 남길까요? 기존 입출금은 유지됩니다."
          : "모든 작업자 금액과 추가 항목을 확인하고 확정할까요?",
      )
    )
      return;
    void run(async () => {
      let target = work;
      let values = draft;
      if (!target.uuid) {
        target = await prepareFinanceWork(loginId, work.scheduleDayUuid);
        if (
          target.status !== "DRAFT" ||
          target.version !== 1 ||
          !target.snapshot
        )
          throw new Error(
            "다른 곳에서 이 작업 금액을 저장했습니다. 입력은 유지됩니다. 최신 작업을 다시 열어 비교해 주세요.",
          );
        values = mergeNewFinanceEdits(
          baseline.current!,
          draft,
          target.snapshot,
        );
        setWork(target);
        baseline.current = target.snapshot;
        setDraft(values);
        if (
          values.lines.some(
            (line) =>
              draft.lines.find(
                (before) => before.assignmentUuid === line.assignmentUuid,
              )?.mode !== line.mode,
          )
        )
          throw new Error(
            "등록된 수납·지급 경로를 불러왔습니다. 입력은 유지됩니다. 금액과 경로를 확인한 후 다시 저장해 주세요.",
          );
      }
      return saveFinanceWork(loginId, target.uuid!, {
        version: target.version,
        status:
          confirm || target.status === "CONFIRMED" ? "CONFIRMED" : "DRAFT",
        reason: reason.trim() || null,
        sourceFingerprint: source.fingerprint,
        defaultMode: values.defaultMode,
        defaultChargeRate: values.defaultChargeRate,
        defaultPayRate: values.defaultPayRate,
        receiptDueDate: values.receiptDueDate,
        lines: values.lines.map(
          ({
            assignmentUuid,
            mode,
            quantity,
            chargeRate,
            payRate,
            chargeAmount,
            payAmount,
            override,
            payoutDueDate,
            note,
            payoutPlan,
          }) => ({
            assignmentUuid,
            mode,
            quantity,
            chargeRate,
            payRate,
            chargeAmount,
            payAmount,
            override,
            payoutDueDate,
            note,
            payoutPlan,
          }),
        ),
        extras: values.extras,
        note: values.note,
      });
    });
  };

  return (
    <>
      <HistoryDialog
        title="작업 금액 확인"
        onClose={close}
        inactive={settingsOpen || bulkField !== null}
        className={styles.financeWorkDialog}
      >
        <div
          className={styles.financeModalForm}
          inert={busy ? true : undefined}
        >
          <div>
            <h3>
              {identity?.workTitle} · {identity?.clientName}
            </h3>
            <p className={styles.financeSecondaryText}>
              {workDate} · {identity?.siteName}
            </p>
          </div>
          <div className={styles.financeActionGroup}>
            <span className={styles.financeStatusBadge}>
              {statusLabels[work.status]}
            </span>
            {work.reviewRequired ? (
              <span className={styles.financeWarningText}>
                금액 재확인 필요
              </span>
            ) : null}
          </div>
          {error ? (
            <p className={styles.financeErrorMessage} role="alert">
              {error}
            </p>
          ) : null}
          {settingsNotice ? (
            <p className={styles.financeNoticeMessage} role="status">
              {settingsNotice}
            </p>
          ) : null}
          {needsIndividualAttendance ? (
            <p className={styles.financeErrorMessage} role="alert">
              개인별 분리·근태 확인 필요: 여러 명으로 묶인 기존 배치를 개인별로
              분리하고 실제 근태를 확인한 뒤 금액을 확정하세요.
            </p>
          ) : null}
          {source ? (
            <div className={styles.financeActionGroup}>
              <button
                className={styles.financeSecondaryButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirmDiscard())
                    onNavigate(
                      `/attendance?workDate=${encodeURIComponent(workDate)}`,
                    );
                }}
              >
                근태 확인
              </button>
            </div>
          ) : (
            <p className={styles.financeWarningText}>
              원본 근태를 조회할 수 없습니다. 과거 확정 기록은 유지됩니다.
            </p>
          )}
          {work.sourceStatus === "ATTENDANCE_UNCONFIRMED" ||
          work.sourceStatus === "NO_WORKED_ATTENDANCE" ? (
            <p className={styles.financeNoticeMessage}>
              근태가 확인된 작업자만 금액에 반영합니다. 근태 확인 화면에서 실제
              근무 기록을 확인해 주세요.
            </p>
          ) : null}
          <section className={styles.financeAmountCalculationSection}>
            <div
              className={styles.financeAmountSectionTabs}
              role="tablist"
              aria-label="작업 금액 구분"
            >
              <button
                role="tab"
                aria-selected={amountSection === "billing"}
                aria-controls="finance-work-amount-panel"
                id="finance-billing-section-tab"
                type="button"
                onClick={() => setAmountSection("billing")}
              >
                농가 청구
              </button>
              <button
                role="tab"
                aria-selected={amountSection === "payout"}
                aria-controls="finance-work-amount-panel"
                id="finance-payout-section-tab"
                type="button"
                onClick={() => setAmountSection("payout")}
              >
                작업자 지급
              </button>
            </div>
            <Field label="작업자 정렬">
              <select
                value={sortByName ? "NAME" : "ORIGINAL"}
                onChange={(event) =>
                  setSortByName(event.target.value === "NAME")
                }
              >
                <option value="NAME">이름순 · 같은 이름 모아 보기</option>
                <option value="ORIGINAL">기존 순서</option>
              </select>
            </Field>
            <div
              id="finance-work-amount-panel"
              role="tabpanel"
              aria-labelledby={`finance-${amountSection}-section-tab`}
            >
              <FinanceWorkerAmountTable
                lines={visibleLines}
                readOnly={!draft}
                section={amountSection}
                sortByName={sortByName}
                workDate={workDate}
                onChange={updateLine}
                onBulk={draft ? setBulkField : undefined}
              />
              {draft ? (
                <FinanceExtraAmountEditor
                  section={amountSection}
                  extras={draft.extras}
                  onChange={(extras) => update({ extras })}
                />
              ) : null}
              {amountSection === "billing" ? (
                <div className={styles.financeBillingBreakdown}>
                  <h3>청구 내역</h3>
                  <ul>
                    {billingBreakdown(visibleLines, draft?.extras ?? []).map(
                      (row, index) => (
                        <li key={index}>
                          <span>
                            {row.name} {formatMoney(row.rate)} × {row.quantity}
                          </span>
                          <strong>{formatMoney(row.amount)}</strong>
                        </li>
                      ),
                    )}
                  </ul>
                  <div className={styles.financeBillingGrandTotal}>
                    <span>청구 합계</span>
                    <strong>{formatMoney(previewTotals.officeCharge)}</strong>
                  </div>
                </div>
              ) : null}
            </div>
            <div
              className={styles.financeCalculationSummary}
              role="group"
              aria-label={draft ? "입력 중 금액 합계" : "일정 청구액 미리보기"}
            >
              <div>
                <span>{draft ? "농가 청구액" : "일정 단가 기준 청구액"}</span>
                <strong>{formatMoney(previewTotals.officeCharge)}</strong>
              </div>
              {draft ? (
                <>
                  <div>
                    <span>작업자 지급액</span>
                    <strong>{formatMoney(previewTotals.officePay)}</strong>
                  </div>
                  <div>
                    <span>추가 비용</span>
                    <strong>{formatMoney(previewTotals.extraCost)}</strong>
                  </div>
                  <div>
                    <span>작업이익</span>
                    <strong>{formatMoney(previewTotals.workProfit)}</strong>
                  </div>
                  <div>
                    <span>농가 직접 지급</span>
                    <strong>{formatMoney(previewTotals.directPay)}</strong>
                  </div>
                </>
              ) : null}
            </div>
          </section>
          {draft ? (
            <>
              {draft.defaultMode === "DIRECT" ||
              draft.lines.some((line) => line.mode === "DIRECT") ? (
                <p className={styles.financeNoticeMessage}>
                  직접 지급분은 농가가 작업자에게 지급할 금액입니다. 사무소
                  비용·입출금에서 제외되며, 사무소에는 소개료만 청구합니다. 실제
                  지급 여부는 별도로 확인합니다.
                </p>
              ) : null}
              {sourceChanged ? (
                <p className={styles.financeNoticeMessage}>
                  근태 변경으로 기존 금액을 자동 삭감하지 않습니다. 아래 금액과
                  현재 근태를 비교하세요. 인원 변경은 명시적으로 반영해야
                  합니다.
                </p>
              ) : null}
              <button
                className={styles.financeSecondaryButton}
                type="button"
                onClick={async () => {
                  if (
                    !work.uuid ||
                    !window.confirm(
                      "최신 근태를 조회하고 확인된 근무자 목록을 반영할까요? 기존 작업자의 금액은 유지하고 새 작업자는 미입력으로 추가합니다.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    const latest = await fetchFinanceDetail(loginId, work.uuid);
                    if (latest.version !== work.version) {
                      if (
                        window.confirm(
                          "다른 사용자가 이 작업 금액을 변경했습니다. 미저장 입력을 버리고 서버의 최신 금액을 불러올까요?",
                        )
                      ) {
                        setWork(latest);
                        baseline.current = latest.snapshot;
                        setDraft(latest.snapshot);
                        setReviewed(false);
                        setReason("");
                      }
                      return;
                    }
                    const actual =
                      latest.currentSource?.assignments.filter(
                        (item) =>
                          item.confirmed && item.attendanceStatus === "WORKED",
                      ) ?? [];
                    setWork(latest);
                    const lines = actual.map((assignment) => {
                      const old = draft.lines.find(
                        (line) =>
                          line.assignmentUuid === assignment.assignmentUuid,
                      );
                      return old
                        ? { ...old, ...assignment }
                        : {
                            ...assignment,
                            mode: draft.defaultMode,
                            quantity: 1,
                            chargeRate: null,
                            payRate: null,
                            chargeAmount: null,
                            payAmount: null,
                            override: false,
                            payoutDueDate: null,
                            note: null,
                          };
                    });
                    update({
                      lines: latest.currentSource
                        ? applyMissingScheduleRates(lines, latest.currentSource)
                        : lines,
                    });
                    setReviewed(false);
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "근태 조회 실패",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy || !work.uuid}
              >
                최신 근태와 명단 맞추기
              </button>
              {sourceChanged ? (
                <label className={styles.financeCheckboxField}>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  현재 근태와 기존 금액을 비교했습니다
                </label>
              ) : null}
              <Field label="농가 수납예정일 · 비우면 미정">
                <input
                  type="date"
                  value={draft.receiptDueDate ?? ""}
                  onChange={(event) =>
                    update({ receiptDueDate: event.target.value || null })
                  }
                />
              </Field>
              <Field label="작업 메모">
                <textarea
                  value={draft.note ?? ""}
                  onChange={(event) =>
                    update({ note: event.target.value || null })
                  }
                />
              </Field>
              {work.status === "CONFIRMED" ? (
                <Field label="확정 금액·예정일 변경 사유 *">
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              ) : null}
              <p className={styles.financeSecondaryText}>
                서버 저장 합계 · 사무소 청구{" "}
                {formatMoney(work.totals.officeCharge)} / 지급{" "}
                {formatMoney(work.totals.officePay)} / 추가 비용{" "}
                {formatMoney(work.totals.extraCost)} / 작업이익{" "}
                {formatMoney(work.totals.workProfit)} / 직접 지급{" "}
                {formatMoney(work.totals.directPay)}
              </p>
              <div className={styles.financeActionGroup}>
                {work.status !== "CONFIRMED" ? (
                  <button
                    className={styles.financeSecondaryButton}
                    disabled={
                      busy ||
                      !source ||
                      needsIndividualAttendance ||
                      !visibleLines.length
                    }
                    type="button"
                    onClick={() => save(false)}
                  >
                    저장
                  </button>
                ) : null}
                <button
                  className={styles.financePrimaryButton}
                  disabled={
                    busy ||
                    !source ||
                    needsIndividualAttendance ||
                    !visibleLines.length
                  }
                  type="button"
                  onClick={() => save(true)}
                >
                  {busy
                    ? "저장 중"
                    : work.status === "CONFIRMED"
                      ? "수정 확정"
                      : "금액 확인·확정"}
                </button>
              </div>
            </>
          ) : null}
          {work.revisions.length ? (
            <details>
              <summary>확정·수정 이력 {work.revisions.length}건</summary>
              <ol className={styles.financeHistoryList}>
                {work.revisions.map((revision) => (
                  <li key={revision.version}>
                    {revision.changedAt} · v{revision.version} ·{" "}
                    {revision.reason || "최초 저장"}
                    <div>
                      수납예정 {revision.snapshot.receiptDueDate ?? "미정"} ·{" "}
                      {revision.snapshot.lines
                        .map(
                          (line) =>
                            `${line.displayName}: ${formatMoney(line.payAmount)} (${line.payoutDueDate ?? "예정일 미정"})`,
                        )
                        .join(", ")}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <details className={styles.financeBulkRateSettings}>
            <summary>공통 기본값·지급 주기 (선택)</summary>
            <p className={styles.financeSecondaryText}>
              새 작업의 기본값입니다. 현재 입력한 금액은 변경하지 않습니다.
            </p>
            <button
              className={styles.financeSecondaryButton}
              disabled={busy}
              type="button"
              onClick={() => setSettingsOpen(true)}
            >
              공통 기본값·지급 주기 설정
            </button>
          </details>
        </div>
      </HistoryDialog>
      {bulkField && draft ? (
        <FinanceBulkAmountEditor
          field={bulkField}
          lines={draft.lines}
          source={source}
          workDate={workDate}
          onChange={(lines) => update({ lines })}
          onClose={() => setBulkField(null)}
        />
      ) : null}
      {settingsOpen ? (
        <FinanceSettingsModal
          loginId={loginId}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => {
            setSettingsOpen(false);
            setSettingsNotice(
              "공통 기본값을 저장했습니다. 현재 작업 금액은 유지됩니다.",
            );
          }}
        />
      ) : null}
    </>
  );
}
