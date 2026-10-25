import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  confirmPlannedAttendance,
  fetchAttendanceRecords,
  updateAttendanceRecord,
  updateAttendanceTaskNote,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceTask,
  type AttendanceTimeEntryType,
} from "../api/attendanceApi";
import appStyles from "../App.module.css";
import { StatusSnackbar } from "../components/StatusSnackbar";
import { WorkerProfileModal } from "../components/WorkerProfileModal";
import { NoShowHistoryModal } from "../components/NoShowHistoryModal";
import { AttendanceNoShowReplacementModal } from "../components/AttendanceNoShowReplacementModal";
import { NoShowCreateModal } from "../components/NoShowCreateModal";
import { notifyNoShowsChanged, subscribeNoShowsChanged } from "../api/noShowApi";
import { fetchWorkers, fetchWorkTypes } from "../api/workforceApi";
import type { WorkerRow } from "../data/workerRows";
import {
  workTypeOptions as fallbackWorkTypeOptions,
} from "../data/workTypeOptions";
import attendanceStyles from "./AttendancePage.module.css";

const styles = { ...appStyles, ...attendanceStyles };

type AttendancePageProps = {
  loginId: string;
  onNavigate: (path: string) => void;
};

type AttendanceDraft = {
  actualEndTime: string;
  actualStartTime: string;
  breakMinutes: string;
  status: AttendanceUiStatus;
  timeEntryType: AttendanceTimeEntryType;
};

type AttendanceUiStatus = AttendanceStatus | "NO_SHOW";
type StatusFilter = "ALL" | AttendanceUiStatus;

type AttendanceWorkerModalState = {
  mode: "create" | "edit";
  record: AttendanceRecord;
  worker?: WorkerRow;
};

const statusOptions: Array<{ label: string; value: AttendanceUiStatus }> = [
  { label: "미확인", value: "DRAFT" },
  { label: "근무", value: "WORKED" },
  { label: "결근", value: "ABSENT" },
  { label: "노쇼", value: "NO_SHOW" },
  { label: "취소", value: "CANCELLED" },
];

const timeEntryOptions: Array<{
  label: string;
  value: AttendanceTimeEntryType;
}> = [
  { label: "일정대로", value: "PLANNED" },
  { label: "직접 확인", value: "EXACT" },
  { label: "대략 입력", value: "ESTIMATED" },
  { label: "시간 모름", value: "UNKNOWN" },
];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayValue() {
  return toDateInputValue(new Date());
}

function initialAttendanceDate() {
  const workDate = new URLSearchParams(window.location.search).get("workDate");
  if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return todayValue();
  }

  const [year, month, day] = workDate.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return toDateInputValue(parsedDate) === workDate ? workDate : todayValue();
}

function moveDate(dateValue: string, offset: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return toDateInputValue(new Date(year, month - 1, day + offset));
}

function formatSelectedDate(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function displayStatus(record: AttendanceRecord): AttendanceUiStatus {
  return record.noShowIncidentUuid ? "NO_SHOW" : record.status;
}

function createDraft(record: AttendanceRecord): AttendanceDraft {
  const usesPlannedDefaults =
    record.status === "DRAFT" &&
    !record.actualStartTime &&
    !record.actualEndTime;
  return {
    actualEndTime: record.actualEndTime || (usesPlannedDefaults ? record.plannedEndTime : ""),
    actualStartTime: record.actualStartTime || (usesPlannedDefaults ? record.plannedStartTime : ""),
    breakMinutes: String(usesPlannedDefaults ? 60 : (record.breakMinutes ?? 0)),
    status: displayStatus(record),
    timeEntryType: usesPlannedDefaults && record.timeEntryType === "UNKNOWN"
      ? "PLANNED"
      : record.timeEntryType,
  };
}

function draftMatchesRecord(draft: AttendanceDraft, record: AttendanceRecord) {
  const baseline = createDraft(record);
  return (
    draft.actualStartTime === baseline.actualStartTime &&
    draft.actualEndTime === baseline.actualEndTime &&
    draft.breakMinutes === baseline.breakMinutes &&
    draft.status === baseline.status &&
    draft.timeEntryType === baseline.timeEntryType
  );
}

function sanitizeTimeInput(value: string) {
  const cleaned = value.replace(/[^0-9:]/g, "").slice(0, 5);
  if (cleaned.includes(":")) {
    return cleaned;
  }

  const digits = cleaned.slice(0, 4);
  if (digits.length === 4) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }
  if (digits.length === 3 && Number(digits.slice(0, 2)) > 23) {
    return `0${digits.slice(0, 1)}:${digits.slice(1)}`;
  }
  return digits;
}

function isValidOptionalTime(value: string) {
  return value === "" || /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

export function AttendancePage({ loginId, onNavigate }: AttendancePageProps) {
  const [selectedDate, setSelectedDate] = useState(initialAttendanceDate);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceTasks, setAttendanceTasks] = useState<AttendanceTask[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [savedTaskNotes, setSavedTaskNotes] = useState<Record<string, string>>({});
  const [taskNoteDrafts, setTaskNoteDrafts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const confirmingAllRef = useRef(false);
  const [savingAssignmentUuid, setSavingAssignmentUuid] = useState<
    string | null
  >(null);
  const [savingScheduleDayUuid, setSavingScheduleDayUuid] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [workerModalState, setWorkerModalState] =
    useState<AttendanceWorkerModalState | null>(null);
  const [noShowHistoryRecord, setNoShowHistoryRecord] = useState<AttendanceRecord | null>(null);
  const [replacementRecord, setReplacementRecord] = useState<AttendanceRecord | null>(null);
  const [pendingNoShowRecord, setPendingNoShowRecord] = useState<AttendanceRecord | null>(null);
  const draftStateRef = useRef({ records, drafts, taskNoteDrafts, savedTaskNotes });
  draftStateRef.current = { records, drafts, taskNoteDrafts, savedTaskNotes };
  const loadGeneration = useRef(0);

  const loadRecords = useCallback(async (preserveDrafts = false) => {
    const generation = ++loadGeneration.current;
    setIsLoading(true);
    try {
      const response = await fetchAttendanceRecords(loginId, selectedDate);
      if (generation !== loadGeneration.current) return;
      const nextRecords = response.records;
      const previous = draftStateRef.current;
      setAttendanceTasks(response.tasks);
      setRecords(nextRecords);
      setDrafts(
        Object.fromEntries(
          nextRecords.map((record) => [
            record.assignmentUuid,
            preserveDrafts && previous.records.some((old) =>
              old.assignmentUuid === record.assignmentUuid && previous.drafts[old.assignmentUuid] &&
              !draftMatchesRecord(previous.drafts[old.assignmentUuid], old))
              ? previous.drafts[record.assignmentUuid] : createDraft(record),
          ]),
        ),
      );
      const nextTaskNotes = Object.fromEntries(
        response.tasks.map((task) => [task.scheduleDayUuid, task.taskNote || ""]),
      );
      setSavedTaskNotes(nextTaskNotes);
      setTaskNoteDrafts(Object.fromEntries(response.tasks.map((task) => [task.scheduleDayUuid,
        preserveDrafts && (previous.taskNoteDrafts[task.scheduleDayUuid] ?? "") !== (previous.savedTaskNotes[task.scheduleDayUuid] ?? "")
          ? previous.taskNoteDrafts[task.scheduleDayUuid] : nextTaskNotes[task.scheduleDayUuid],
      ])));
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      if (!preserveDrafts) {
        setAttendanceTasks([]);
        setRecords([]);
        setDrafts({});
        setSavedTaskNotes({});
        setTaskNoteDrafts({});
      }
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "근태 기록을 불러오지 못했습니다.",
      );
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, [loginId, selectedDate]);

  useEffect(() => {
    void loadRecords();
    return () => { loadGeneration.current++; };
  }, [loadRecords]);

  useEffect(() => subscribeNoShowsChanged(() => { void loadRecords(true); }), [loadRecords]);

  useEffect(() => {
    Promise.all([fetchWorkers(loginId), fetchWorkTypes(loginId)])
      .then(([nextWorkers, nextWorkTypes]) => {
        setWorkers(nextWorkers);
        setWorkTypes(nextWorkTypes);
      })
      .catch(() => setStatusMessage("작업자 정보를 불러오지 못했습니다."));
  }, [loginId]);

  const openWorkerModal = (record: AttendanceRecord) => {
    if (record.participantType === "guest") {
      setWorkerModalState({ mode: "create", record });
      return;
    }

    const worker = workers.find(
      (candidate) => candidate.profileUuid === record.workerProfileUuid,
    );
    if (!worker) {
      setStatusMessage("수정할 작업자 정보를 찾지 못했습니다.");
      return;
    }
    setWorkerModalState({ mode: "edit", record, worker });
  };

  const visibleRecords = useMemo(
    () =>
      statusFilter === "ALL"
        ? records
        : records.filter((record) => displayStatus(record) === statusFilter),
    [records, statusFilter],
  );

  const groupedRecords = useMemo(() => {
    const recordsByScheduleDay = new Map<string, AttendanceRecord[]>();
    visibleRecords.forEach((record) => {
      const group = recordsByScheduleDay.get(record.scheduleDayUuid) ?? [];
      group.push(record);
      recordsByScheduleDay.set(record.scheduleDayUuid, group);
    });
    return attendanceTasks
      .map((task) => ({
        records: recordsByScheduleDay.get(task.scheduleDayUuid) ?? [],
        task,
      }))
      .filter((group) => statusFilter === "ALL" || group.records.length > 0);
  }, [attendanceTasks, statusFilter, visibleRecords]);

  const summary = useMemo(
    () => ({
      absent: records.filter((record) => displayStatus(record) === "ABSENT").length,
      noShow: records.filter((record) => displayStatus(record) === "NO_SHOW").length,
      cancelled: records.filter((record) => displayStatus(record) === "CANCELLED")
        .length,
      draft: records.filter((record) => displayStatus(record) === "DRAFT").length,
      total: records.length,
      worked: records.filter((record) => displayStatus(record) === "WORKED").length,
    }),
    [records],
  );

  const isFutureDate = selectedDate > todayValue();

  const updateDraft = (
    assignmentUuid: string,
    changes: Partial<AttendanceDraft>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [assignmentUuid]: { ...current[assignmentUuid], ...changes },
    }));
  };

  const updateActualTime = (
    assignmentUuid: string,
    field: "actualStartTime" | "actualEndTime",
    value: string,
  ) => {
    updateDraft(assignmentUuid, {
      [field]: value,
      status: "WORKED",
      timeEntryType: "EXACT",
    });
  };

  const handleSave = async (record: AttendanceRecord) => {
    const draft = drafts[record.assignmentUuid];
    if (!draft) {
      return;
    }
    if (draft.status === "NO_SHOW" && !record.noShowIncidentUuid) {
      setPendingNoShowRecord(record);
      return;
    }

    setSavingAssignmentUuid(record.assignmentUuid);
    try {
      if (record.noShowIncidentUuid) {
        setStatusMessage("노쇼 관리에서 노쇼를 취소한 뒤 근태를 수정해 주세요.");
        return;
      }
      if (draft.status === "NO_SHOW") {
        return;
      }
      const updatedRecord = await updateAttendanceRecord(
        loginId,
        record.assignmentUuid,
        {
          actualEndTime: draft.actualEndTime || null,
          actualStartTime: draft.actualStartTime || null,
          breakMinutes: Number(draft.breakMinutes || 0),
          status: draft.status,
          timeEntryType: draft.timeEntryType,
        },
      );
      setRecords((current) =>
        current.map((item) =>
          item.assignmentUuid === updatedRecord.assignmentUuid
            ? updatedRecord
            : item,
        ),
      );
      setDrafts((current) => ({
        ...current,
        [updatedRecord.assignmentUuid]: createDraft(updatedRecord),
      }));
      setStatusMessage(`${updatedRecord.displayName} 근태를 저장했습니다.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "근태 기록을 저장하지 못했습니다.",
      );
    } finally {
      setSavingAssignmentUuid(null);
    }
  };

  const handleTaskNoteSave = async (scheduleDayUuid: string) => {
    const note = taskNoteDrafts[scheduleDayUuid] ?? "";
    setSavingScheduleDayUuid(scheduleDayUuid);
    try {
      const response = await updateAttendanceTaskNote(loginId, scheduleDayUuid, note);
      setSavedTaskNotes((current) => ({ ...current, [scheduleDayUuid]: response.note }));
      setTaskNoteDrafts((current) => ({ ...current, [scheduleDayUuid]: response.note }));
      setAttendanceTasks((current) => current.map((task) => (
        task.scheduleDayUuid === scheduleDayUuid
          ? { ...task, taskNote: response.note }
          : task
      )));
      setRecords((current) => current.map((record) => (
        record.scheduleDayUuid === scheduleDayUuid
          ? { ...record, taskNote: response.note }
          : record
      )));
      setStatusMessage("근태 메모를 저장했습니다.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "근태 메모를 저장하지 못했습니다.",
      );
    } finally {
      setSavingScheduleDayUuid(null);
    }
  };

  const navigateToWorkJournal = (
    task: AttendanceTask,
    taskRecords: AttendanceRecord[],
    destination: "journal" | "finance" = "journal",
  ) => {
    const hasUnsavedRecords = taskRecords.some((record) => {
      const draft = drafts[record.assignmentUuid] ?? createDraft(record);
      return !draftMatchesRecord(draft, record);
    });
    const hasUnsavedNote =
      (taskNoteDrafts[task.scheduleDayUuid] ?? "") !==
      (savedTaskNotes[task.scheduleDayUuid] ?? "");
    if (
      (hasUnsavedRecords || hasUnsavedNote) &&
      !window.confirm(`저장하지 않은 근태 변경사항이 있습니다. ${destination === "finance" ? "금액 확인" : "작업일지"}으로 이동할까요?`)
    ) {
      return;
    }
    const returnTo = `/attendance?workDate=${encodeURIComponent(selectedDate)}`;
    if (destination === "finance") {
      onNavigate(`/finance?scheduleDayUuid=${encodeURIComponent(task.scheduleDayUuid)}&workDate=${encodeURIComponent(selectedDate)}`);
      return;
    }
    onNavigate(
      `/work-journals?scheduleDayUuid=${encodeURIComponent(task.scheduleDayUuid)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  const handleConfirmAll = async () => {
    if (confirmingAllRef.current || isLoading || isFutureDate || savingAssignmentUuid || savingScheduleDayUuid) return;
    const hasUnsavedRecords = records.some((record) =>
      !draftMatchesRecord(drafts[record.assignmentUuid] ?? createDraft(record), record),
    );
    const hasUnsavedNotes = attendanceTasks.some((task) =>
      (taskNoteDrafts[task.scheduleDayUuid] ?? "") !== (savedTaskNotes[task.scheduleDayUuid] ?? ""),
    );
    if (hasUnsavedRecords || hasUnsavedNotes) {
      setStatusMessage("저장하지 않은 근태 또는 메모가 있습니다. 먼저 저장한 뒤 모두 예정대로 처리해 주세요.");
      return;
    }
    if (!window.confirm(`${selectedDate}의 미확정 근태를 모두 예정시간과 휴게 60분으로 근무 처리할까요?\n현재 목록 필터와 관계없이 해당 날짜 전체에 적용하며, 이미 확정된 근무·결근·취소 기록은 유지합니다.`)) return;
    confirmingAllRef.current = true;
    setIsConfirmingAll(true);
    try {
      const confirmedCount = await confirmPlannedAttendance(loginId, {
        scope: "DATE",
        workDate: selectedDate,
      });
      await loadRecords();
      setStatusMessage(confirmedCount > 0
        ? `${confirmedCount}건의 근태를 예정대로 저장했습니다.`
        : "처리할 미확정 근태가 없습니다.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "예정 근무를 확정하지 못했습니다.",
      );
    } finally {
      confirmingAllRef.current = false;
      setIsConfirmingAll(false);
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section
        className={styles.attendancePanel}
        aria-labelledby="attendance-title"
        aria-busy={isConfirmingAll}
      >
        <header className={styles.attendanceHeader}>
          <div>
            <p className={styles.sectionLabel}>근태 관리</p>
            <h1 id="attendance-title">일별 근무 기록</h1>
          </div>
          <button
            className={styles.confirmPlannedButton}
            disabled={
              isFutureDate ||
              isLoading ||
              isConfirmingAll ||
              savingAssignmentUuid !== null ||
              savingScheduleDayUuid !== null ||
              !records.some((record) => record.status === "DRAFT" || !record.confirmed)
            }
            type="button"
            onClick={() => void handleConfirmAll()}
          >
            {isConfirmingAll ? "저장 중" : "모두 예정대로"}
          </button>
        </header>

        <div className={styles.attendanceDateBar} inert={isConfirmingAll ? true : undefined}>
          <button
            type="button"
            onClick={() => setSelectedDate(moveDate(selectedDate, -1))}
          >
            이전
          </button>
          <label className={styles.attendanceDateField}>
            <span>{formatSelectedDate(selectedDate)}</span>
            <input
              aria-label="근태 날짜 선택"
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value || todayValue())
              }
            />
          </label>
          <button
            type="button"
            onClick={() => setSelectedDate(moveDate(selectedDate, 1))}
          >
            다음
          </button>
          <button
            className={styles.todayButton}
            type="button"
            onClick={() => setSelectedDate(todayValue())}
          >
            오늘
          </button>
        </div>

        <div className={styles.attendanceSummary} aria-label="근태 현황 요약">
          <span>
            <strong>{summary.total}</strong> 배정
          </span>
          <span>
            <strong>{summary.worked}</strong> 근무
          </span>
          <span>
            <strong>{summary.draft}</strong> 미확인
          </span>
          <span>
            <strong>{summary.absent}</strong> 결근
          </span>
          <span>
            <strong>{summary.noShow}</strong> 노쇼
          </span>
          <span>
            <strong>{summary.cancelled}</strong> 취소
          </span>
        </div>

        <div className={styles.attendanceFilters} aria-label="근태 상태 필터">
          <span>상태</span>
          {(
            [
              "ALL",
              ...statusOptions.map((option) => option.value),
            ] as StatusFilter[]
          ).map((value) => {
            const label =
              value === "ALL"
                ? "전체"
                : statusOptions.find((option) => option.value === value)?.label;
            return (
              <button
                className={
                  statusFilter === value ? styles.activeFilterButton : undefined
                }
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className={styles.attendanceEmpty}>
            근태 기록을 불러오는 중입니다.
          </div>
        ) : groupedRecords.length === 0 ? (
          <div className={styles.attendanceEmpty}>
            {attendanceTasks.length === 0
              ? "선택한 날짜에 등록된 일정이 없습니다."
              : "조건에 맞는 근태 기록이 없습니다."}
          </div>
        ) : (
          <div className={styles.attendanceTaskList} inert={isConfirmingAll ? true : undefined}>
            {groupedRecords.map((group) => {
              const { records: taskRecords, task } = group;
              return (
                <section
                  className={styles.attendanceTaskSection}
                  key={task.scheduleDayUuid}
                >
                  <header className={styles.attendanceTaskHeader}>
                    <div>
                      <h2>
                        {task.workTitle} <span>/ {task.ownerName}</span>
                      </h2>
                      <p>
                        {[task.siteName, task.address]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className={styles.attendanceTaskHeaderActions}>
                      <strong>{taskRecords.length}명</strong>
                      <button
                        className={styles.attendanceJournalButton}
                        type="button"
                        onClick={() => navigateToWorkJournal(task, taskRecords)}
                      >
                        작업일지
                      </button>
                      <button
                        className={styles.attendanceJournalButton}
                        type="button"
                        onClick={() => navigateToWorkJournal(task, taskRecords, "finance")}
                      >
                        금액 확인
                      </button>
                    </div>
                  </header>
                  <div className={styles.attendanceTableFrame}>
                    <table className={styles.attendanceTable}>
                      <thead>
                        <tr>
                          <th scope="col">작업자</th>
                          <th scope="col">성별</th>
                          <th scope="col">예정 시간</th>
                          <th scope="col">실제 시작</th>
                          <th scope="col">실제 종료</th>
                          <th scope="col">휴게(분)</th>
                          <th scope="col">상태</th>
                          <th scope="col">시간 확인</th>
                          <th scope="col">관리</th>
                          <th scope="col">저장</th>
                        </tr>
                      </thead>
                      <tbody>
                        {taskRecords.length === 0 ? (
                          <tr>
                            <td
                              className={styles.attendanceUnassignedCell}
                              colSpan={10}
                            >
                              배정된 작업자가 없습니다.
                            </td>
                          </tr>
                        ) : taskRecords.map((record) => {
                          const draft =
                            drafts[record.assignmentUuid] ??
                            createDraft(record);
                          const isSaving =
                            savingAssignmentUuid === record.assignmentUuid;
                          const isDirty = !draftMatchesRecord(draft, record);
                          const disablesTime =
                            draft.status === "ABSENT" ||
                            draft.status === "NO_SHOW" ||
                            draft.status === "CANCELLED";
                          const hasValidTimes =
                            isValidOptionalTime(draft.actualStartTime) &&
                            isValidOptionalTime(draft.actualEndTime);
                          return (
                            <tr key={record.assignmentUuid}>
                              <td data-label="작업자">
                                <div
                                  className={styles.attendanceWorkerIdentity}
                                >
                                  <strong>{record.displayName}</strong>
                                  {record.noShowIncidentUuid && record.status !== "ABSENT" ? <span className={styles.noShowWarning}>노쇼·근태 상태 확인 필요</span> : null}
                                  <span>
                                    {record.pickupLocation || "승차장소 없음"}
                                  </span>
                                  {record.participantType === "guest" && (
                                    <em>익명 참여자</em>
                                  )}
                                </div>
                              </td>
                              <td data-label="성별">{record.area === "men" ? "남자" : "여자"}</td>
                              <td className={styles.plannedTimeCell} data-label="예정 시간">
                                {record.plannedStartTime || "--:--"} -{" "}
                                {record.plannedEndTime || "--:--"}
                              </td>
                              <td data-label="실제 시작">
                                <input
                                  aria-label={`${record.displayName} 실제 시작 시간`}
                                  disabled={disablesTime || isFutureDate}
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="HH:mm"
                                  type="text"
                                  value={draft.actualStartTime}
                                  onChange={(event) =>
                                    updateActualTime(
                                      record.assignmentUuid,
                                      "actualStartTime",
                                      sanitizeTimeInput(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td data-label="실제 종료">
                                <input
                                  aria-label={`${record.displayName} 실제 종료 시간`}
                                  disabled={disablesTime || isFutureDate}
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="HH:mm"
                                  type="text"
                                  value={draft.actualEndTime}
                                  onChange={(event) =>
                                    updateActualTime(
                                      record.assignmentUuid,
                                      "actualEndTime",
                                      sanitizeTimeInput(event.target.value),
                                    )
                                  }
                                />
                              </td>
                              <td data-label="휴게(분)">
                                <input
                                  aria-label={`${record.displayName} 휴게 시간`}
                                  disabled={disablesTime || isFutureDate}
                                  inputMode="numeric"
                                  maxLength={4}
                                  pattern="[0-9]*"
                                  type="text"
                                  value={draft.breakMinutes}
                                  onChange={(event) =>
                                    {
                                      const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
                                      if (digits === "" || Number(digits) <= 1440) {
                                        updateDraft(record.assignmentUuid, {
                                          breakMinutes: digits,
                                          status: "WORKED",
                                        });
                                      }
                                    }
                                  }
                                />
                              </td>
                              <td data-label="상태">
                                <select
                                  aria-label={`${record.displayName} 근태 상태`}
                                  disabled={isFutureDate || Boolean(record.noShowIncidentUuid)}
                                  value={draft.status}
                                  onChange={(event) =>
                                    updateDraft(record.assignmentUuid, event.target.value === "NO_SHOW"
                                      ? { status: "NO_SHOW", actualStartTime: "", actualEndTime: "", breakMinutes: "0", timeEntryType: "UNKNOWN" }
                                      : { status: event.target.value as AttendanceUiStatus })
                                  }
                                >
                                  {statusOptions.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td data-label="시간 확인">
                                <select
                                  aria-label={`${record.displayName} 시간 기록 방식`}
                                  disabled={disablesTime || isFutureDate}
                                  value={draft.timeEntryType}
                                  onChange={(event) =>
                                    updateDraft(record.assignmentUuid, {
                                      timeEntryType: event.target
                                        .value as AttendanceTimeEntryType,
                                    })
                                  }
                                >
                                  {timeEntryOptions.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td data-label="관리">
                                {record.noShowIncidentUuid ? <div className={styles.noShowActions}>
                                  <button className={styles.editAttendanceWorkerButton} type="button" onClick={() => setNoShowHistoryRecord(record)}>노쇼 관리</button>
                                  <button className={styles.editAttendanceWorkerButton} type="button" disabled={isFutureDate} onClick={() => setReplacementRecord(record)}>
                                    {record.noShowIncidentStatus === "REPLACED" ? "대체자 변경" : "대체자 선택"}
                                  </button>
                                </div> : null}
                                <button
                                  className={styles.editAttendanceWorkerButton}
                                  type="button"
                                  onClick={() => openWorkerModal(record)}
                                >
                                  {record.participantType === "guest"
                                    ? "작업자 등록"
                                    : "수정/평가"}
                                </button>
                              </td>
                              <td data-label="저장">
                                <button
                                  className={styles.saveAttendanceButton}
                                  disabled={
                                    !isDirty || isSaving || isFutureDate
                                    || !hasValidTimes
                                  }
                                  type="button"
                                  onClick={() => void handleSave(record)}
                                >
                                  {isSaving ? "저장 중" : "저장"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className={styles.attendanceTaskNote}>
                    <label htmlFor={`attendance-note-${task.scheduleDayUuid}`}>근태 메모</label>
                    <textarea
                      disabled={isFutureDate}
                      id={`attendance-note-${task.scheduleDayUuid}`}
                      maxLength={4000}
                      placeholder="현장 특이사항이나 근무 확인 내용을 입력하세요."
                      rows={2}
                      value={taskNoteDrafts[task.scheduleDayUuid] ?? ""}
                      onChange={(event) => setTaskNoteDrafts((current) => ({
                        ...current,
                        [task.scheduleDayUuid]: event.target.value,
                      }))}
                    />
                    <button
                      disabled={
                        isFutureDate ||
                        savingScheduleDayUuid === task.scheduleDayUuid ||
                        (taskNoteDrafts[task.scheduleDayUuid] ?? "") ===
                          (savedTaskNotes[task.scheduleDayUuid] ?? "")
                      }
                      type="button"
                      onClick={() => void handleTaskNoteSave(task.scheduleDayUuid)}
                    >
                      {savingScheduleDayUuid === task.scheduleDayUuid ? "저장 중" : "메모 저장"}
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
      <StatusSnackbar
        message={statusMessage}
        onDismiss={() => setStatusMessage("")}
      />
      {workerModalState ? (
        <WorkerProfileModal
          loginId={loginId}
          mode={workerModalState.mode}
          workers={workers}
          sourceAssignmentUuid={
            workerModalState.mode === "create"
              ? workerModalState.record.assignmentUuid
              : undefined
          }
          worker={
            workerModalState.mode === "edit"
              ? workerModalState.worker
              : {
                  name: workerModalState.record.displayName,
                  phone: "",
                  pickupLocation: workerModalState.record.pickupLocation,
                  workTypeCodes: [],
                }
          }
          workTypeOptions={workTypes}
          onClose={() => setWorkerModalState(null)}
          onSaved={(nextWorkers) => {
            setWorkers(nextWorkers);
            setWorkerModalState(null);
            void loadRecords(true);
            setStatusMessage(
              workerModalState.mode === "create"
                ? "익명 참여자를 작업자로 등록했습니다."
                : "작업자 정보를 저장했습니다.",
            );
          }}
        />
      ) : null}
      {noShowHistoryRecord ? <NoShowHistoryModal
        loginId={loginId}
        workerProfileUuid={noShowHistoryRecord.workerProfileUuid ?? undefined}
        workDate={noShowHistoryRecord.workerProfileUuid ? undefined : noShowHistoryRecord.workDate}
        assignmentUuid={noShowHistoryRecord.assignmentUuid}
        onClose={() => setNoShowHistoryRecord(null)}
      /> : null}
      {replacementRecord ? <AttendanceNoShowReplacementModal loginId={loginId} record={replacementRecord}
        onClose={() => setReplacementRecord(null)} onSaved={() => { setReplacementRecord(null); notifyNoShowsChanged(); }} /> : null}
      {pendingNoShowRecord ? <NoShowCreateModal loginId={loginId} record={pendingNoShowRecord}
        onClose={() => setPendingNoShowRecord(null)} onSaved={() => {
          setPendingNoShowRecord(null);
          setStatusMessage("노쇼를 기록했습니다. 노쇼 관리에서 이력을 확인하거나 대체자를 선택할 수 있습니다.");
        }} /> : null}
    </main>
  );
}
