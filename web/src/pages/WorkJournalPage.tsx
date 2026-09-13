import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteWorkJournal,
  fetchWorkJournal,
  fetchWorkJournals,
  saveWorkJournal,
  type WorkJournalAttendance,
  type WorkJournalDetail,
  type WorkJournalSummary,
} from "../api/journalApi";
import { fetchScheduleTasks, type ScheduleTask } from "../api/scheduleApi";
import appStyles from "../App.module.css";
import { StatusSnackbar } from "../components/StatusSnackbar";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import styles from "./JournalPages.module.css";

type WorkJournalPageProps = {
  loginId: string;
  onNavigate: (path: string) => void;
};

const attendanceLabels: Record<WorkJournalAttendance["status"], string> = {
  WORKED: "근무",
  ABSENT: "결근",
  CANCELLED: "취소",
  DRAFT: "미확정",
  UNRECORDED: "근태 미입력",
};

function initialScheduleDayUuid() {
  return new URLSearchParams(window.location.search).get("scheduleDayUuid");
}

function initialReturnPath() {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/") ? value : "/schedule";
}

function businessTodayValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function attendanceTime(record: WorkJournalAttendance) {
  if (!record.actualStartTime && !record.actualEndTime) return "실제 시간 미입력";
  const range = `${record.actualStartTime || "--:--"} - ${record.actualEndTime || "--:--"}`;
  return record.breakMinutes === null ? range : `${range} · 휴게 ${record.breakMinutes}분`;
}

export function WorkJournalPage({ loginId, onNavigate }: WorkJournalPageProps) {
  const [journals, setJournals] = useState<WorkJournalSummary[]>([]);
  const [selectedScheduleDayUuid, setSelectedScheduleDayUuid] = useState<string | null>(initialScheduleDayUuid);
  const [detail, setDetail] = useState<WorkJournalDetail | null>(null);
  const [memo, setMemo] = useState("");
  const [savedMemo, setSavedMemo] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    clientQuery: "",
    fromDate: "",
    toDate: "",
  });
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(Boolean(initialScheduleDayUuid()));
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [taskPickerDate, setTaskPickerDate] = useState(businessTodayValue);
  const [taskPickerQuery, setTaskPickerQuery] = useState("");
  const [taskPickerTasks, setTaskPickerTasks] = useState<ScheduleTask[]>([]);
  const [isTaskPickerLoading, setIsTaskPickerLoading] = useState(false);
  const [taskPickerError, setTaskPickerError] = useState("");
  const isDirty = memo !== savedMemo;
  const confirmDiscard = useUnsavedChangesGuard(isDirty);
  const returnPath = useMemo(initialReturnPath, []);

  const loadList = useCallback(async () => {
    setIsListLoading(true);
    setListError("");
    try {
      setJournals(await fetchWorkJournals(loginId, appliedFilters));
    } catch (error) {
      setListError(error instanceof Error ? error.message : "작업일지 목록을 불러오지 못했습니다.");
    } finally {
      setIsListLoading(false);
    }
  }, [appliedFilters, loginId]);

  const loadDetail = useCallback(async (scheduleDayUuid: string) => {
    setIsDetailLoading(true);
    setDetailError("");
    try {
      const nextDetail = await fetchWorkJournal(loginId, scheduleDayUuid);
      setDetail(nextDetail);
      setMemo(nextDetail.memo || "");
      setSavedMemo(nextDetail.memo || "");
    } catch (error) {
      setDetail(null);
      setDetailError(error instanceof Error ? error.message : "작업일지를 불러오지 못했습니다.");
    } finally {
      setIsDetailLoading(false);
    }
  }, [loginId]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (selectedScheduleDayUuid) void loadDetail(selectedScheduleDayUuid);
  }, [loadDetail, selectedScheduleDayUuid]);

  useEffect(() => {
    if (!isTaskPickerOpen) return;
    if (!taskPickerDate) {
      setTaskPickerTasks([]);
      setTaskPickerError("");
      return;
    }

    let isCurrent = true;
    setIsTaskPickerLoading(true);
    setTaskPickerError("");
    fetchScheduleTasks(loginId, taskPickerDate)
      .then((tasks) => {
        if (isCurrent) setTaskPickerTasks(tasks);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setTaskPickerTasks([]);
        setTaskPickerError(
          error instanceof Error ? error.message : "작업 목록을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (isCurrent) setIsTaskPickerLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isTaskPickerOpen, loginId, taskPickerDate]);

  const filteredTaskPickerTasks = useMemo(() => {
    const normalizedQuery = taskPickerQuery.trim().toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return taskPickerTasks;
    return taskPickerTasks.filter((task) =>
      [task.ownerName, task.siteName, task.address, task.title]
        .join(" ")
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery),
    );
  }, [taskPickerQuery, taskPickerTasks]);

  const openTaskPicker = () => {
    setTaskPickerQuery("");
    setIsTaskPickerOpen(true);
  };

  const chooseTask = (task: ScheduleTask) => {
    if (!confirmDiscard()) return;
    if (task.id === selectedScheduleDayUuid) {
      void loadDetail(task.id);
    } else {
      setSelectedScheduleDayUuid(task.id);
    }
    setIsTaskPickerOpen(false);
  };

  const selectJournal = (scheduleDayUuid: string) => {
    if (scheduleDayUuid === selectedScheduleDayUuid || !confirmDiscard()) return;
    setSelectedScheduleDayUuid(scheduleDayUuid);
  };

  const saveJournal = async () => {
    if (!selectedScheduleDayUuid || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await saveWorkJournal(loginId, selectedScheduleDayUuid, memo);
      setDetail(saved);
      setMemo(saved.memo || "");
      setSavedMemo(saved.memo || "");
      setStatusMessage("작업일지를 저장했습니다.");
      await loadList();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "작업일지를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeJournal = async () => {
    if (!detail?.journalUuid || isSaving) return;
    if (!window.confirm("이 작업일지를 삭제하시겠습니까? 일정, 배치, 근태 원본은 삭제되지 않습니다.")) return;
    setIsSaving(true);
    try {
      await deleteWorkJournal(loginId, detail.scheduleDayUuid);
      setDetail({ ...detail, journalUuid: null, memo: "", createdAt: null, updatedAt: null });
      setMemo("");
      setSavedMemo("");
      setStatusMessage("작업일지 기록만 삭제했습니다.");
      await loadList();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "작업일지를 삭제하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={appStyles.tableMainContent}>
      <section className={styles.journalPanel} aria-labelledby="work-journal-title">
        <div className={styles.journalHeader}>
          <div><p className={styles.sectionLabel}>작업일지</p><h1 id="work-journal-title">실제 작업 기록</h1></div>
          <div className={styles.journalHeaderActions}>
            <button className={styles.primaryButton} type="button" onClick={openTaskPicker}>작업일지 작성</button>
            <button className={styles.secondaryButton} type="button" onClick={() => onNavigate(returnPath)}>일정으로 돌아가기</button>
          </div>
        </div>

        <form className={styles.filterBar} onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ fromDate, toDate, clientQuery: clientQuery.trim() }); }}>
          <label className={styles.filterField}><span>시작일</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className={styles.filterField}><span>종료일</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <label className={`${styles.filterField} ${styles.searchField}`}><span>거래처 검색</span><input type="search" value={clientQuery} onChange={(event) => setClientQuery(event.target.value)} placeholder="거래처 이름 또는 호칭" /></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </form>

        <div className={styles.journalWorkspace}>
          <section className={styles.listPanel} aria-label="작업일지 목록">
            <h2 className={styles.panelHeading}>저장된 작업일지</h2>
            {isListLoading ? <div className={styles.loadingState}>불러오는 중입니다.</div> : listError ? <div className={styles.errorState}>{listError}</div> : journals.length === 0 ? <div className={styles.emptyState}>{fromDate || toDate || clientQuery ? "검색 결과가 없습니다." : "저장된 작업일지가 없습니다."}</div> : (
              <div className={styles.journalList}>{journals.map((journal) => (
                <button className={`${styles.listItem} ${selectedScheduleDayUuid === journal.scheduleDayUuid ? styles.activeListItem : ""}`} key={journal.journalUuid} type="button" onClick={() => selectJournal(journal.scheduleDayUuid)}>
                  <span className={styles.listDate}>{journal.workDate}</span>
                  <span className={styles.listTitle}>{journal.workTitle || "작업 내용 미입력"} / {journal.ownerName || "거래처 미입력"}</span>
                  <span className={styles.listExcerpt}>{journal.memo || "작성된 작업 메모가 없습니다."}</span>
                </button>
              ))}</div>
            )}
          </section>

          <section className={styles.detailPanel} aria-label="작업일지 상세">
            {isDetailLoading ? <div className={styles.loadingState}>작업 정보를 불러오는 중입니다.</div> : detailError ? <div className={styles.errorState}>{detailError}</div> : detail ? (
              <>
                <div className={styles.metadataGrid}>
                  <div className={styles.metadataItem}><span>작업일</span><strong>{detail.workDate}</strong></div>
                  <div className={styles.metadataItem}><span>거래처</span><strong>{detail.ownerName || "-"}</strong></div>
                  <div className={styles.metadataItem}><span>현장</span><strong>{detail.siteName || "-"}</strong></div>
                  <div className={styles.metadataItem}><span>작업 내용</span><strong>{detail.workTitle || "-"}</strong></div>
                  <div className={`${styles.metadataItem} ${styles.wideMetadataItem}`}><span>주소</span><strong>{detail.address || "-"}</strong></div>
                </div>

                <section className={styles.attendanceSection} aria-labelledby="work-journal-attendance-title">
                  <div className={styles.attendanceHeader}><h2 id="work-journal-attendance-title">실제 근무 기록</h2><span>실제 인원 {detail.actualWorkerCount}명</span></div>
                  {detail.attendance.length === 0 ? <div className={styles.emptyState}>배정 및 근태 기록이 없습니다.</div> : <div className={styles.attendanceList}>{detail.attendance.map((record, index) => (
                    <div className={styles.attendanceRow} key={`${record.displayName}-${index}`}>
                      <span className={styles.attendanceName}>
                        {record.displayName}{record.workerCount > 1 ? ` · ${record.workerCount}명` : ""}
                      </span>
                      <span className={styles.attendanceStatus}>{attendanceLabels[record.status]}</span>
                      <span className={styles.attendanceTime}>{attendanceTime(record)}</span>
                    </div>
                  ))}</div>}
                </section>

                <label className={styles.field}><span>작업 메모</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="진행 내용, 남은 작업, 특이사항과 필요한 후속 내용을 자유롭게 기록하세요." /></label>
                <p className={styles.journalNotice}>이 화면의 일정·현장·근태 정보는 현재 원본을 조회한 값이며, 작업 메모 저장은 원본 데이터를 변경하지 않습니다.</p>
                <div className={styles.detailActions}>
                  {detail.journalUuid ? <button className={styles.dangerButton} disabled={isSaving} type="button" onClick={() => void removeJournal()}>일지 삭제</button> : null}
                  <button className={styles.primaryButton} disabled={isSaving} type="button" onClick={() => void saveJournal()}>{isSaving ? "저장 중" : "저장"}</button>
                </div>
              </>
            ) : <div className={styles.emptyState}>작업일지 작성 버튼에서 기존 작업을 선택하거나, 저장된 목록을 선택하세요.</div>}
          </section>
        </div>
      </section>
      {isTaskPickerOpen ? (
        <div
          className={styles.taskPickerOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsTaskPickerOpen(false);
          }}
        >
          <section
            aria-labelledby="work-journal-task-picker-title"
            aria-modal="true"
            className={styles.taskPickerDialog}
            role="dialog"
          >
            <header className={styles.taskPickerHeader}>
              <div>
                <p className={styles.sectionLabel}>작업일지 작성</p>
                <h2 id="work-journal-task-picker-title">기존 작업 선택</h2>
              </div>
              <button className={styles.secondaryButton} type="button" onClick={() => setIsTaskPickerOpen(false)}>취소</button>
            </header>
            <div className={styles.taskPickerFilters}>
              <label className={styles.filterField}>
                <span>작업일</span>
                <input type="date" value={taskPickerDate} onChange={(event) => setTaskPickerDate(event.target.value)} />
              </label>
              <label className={`${styles.filterField} ${styles.searchField}`}>
                <span>작업내용</span>
                <input
                  autoFocus
                  type="search"
                  value={taskPickerQuery}
                  placeholder="거래처, 현장 또는 작업 내용"
                  onChange={(event) => setTaskPickerQuery(event.target.value)}
                />
              </label>
            </div>
            <div className={styles.taskPickerList}>
              {isTaskPickerLoading ? (
                <div className={styles.loadingState}>작업을 불러오는 중입니다.</div>
              ) : taskPickerError ? (
                <div className={styles.errorState}>{taskPickerError}</div>
              ) : filteredTaskPickerTasks.length === 0 ? (
                <div className={styles.emptyState}>선택한 날짜에 조건과 맞는 작업이 없습니다.</div>
              ) : filteredTaskPickerTasks.map((task) => (
                <button className={styles.taskPickerItem} key={task.id} type="button" onClick={() => chooseTask(task)}>
                  <span>{task.ownerName || "거래처 미입력"}</span>
                  <strong>{task.title || "작업 내용 미입력"}</strong>
                  <small>{[task.siteName, task.address].filter(Boolean).join(" · ") || "현장 정보 없음"}</small>
                  <small>{task.timeRange || "시간 미입력"}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      <StatusSnackbar message={statusMessage} onDismiss={() => setStatusMessage("")} />
    </main>
  );
}
