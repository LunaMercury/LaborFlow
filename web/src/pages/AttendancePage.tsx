import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmPlannedAttendance,
  fetchAttendanceRecords,
  updateAttendanceRecord,
  updateAttendanceTaskNote,
  type AttendanceRecord,
  type AttendanceStatus,
  type AttendanceTimeEntryType,
} from "../api/attendanceApi";
import appStyles from "../App.module.css";
import { StatusSnackbar } from "../components/StatusSnackbar";
import attendanceStyles from "./AttendancePage.module.css";

const styles = { ...appStyles, ...attendanceStyles };

type AttendancePageProps = {
  loginId: string;
};

type AttendanceDraft = {
  actualEndTime: string;
  actualStartTime: string;
  breakMinutes: string;
  status: AttendanceStatus;
  timeEntryType: AttendanceTimeEntryType;
};

type StatusFilter = "ALL" | AttendanceStatus;

const statusOptions: Array<{ label: string; value: AttendanceStatus }> = [
  { label: "미확인", value: "DRAFT" },
  { label: "근무", value: "WORKED" },
  { label: "결근", value: "ABSENT" },
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

function createDraft(record: AttendanceRecord): AttendanceDraft {
  const usesPlannedDefaults =
    record.status === "DRAFT" &&
    !record.actualStartTime &&
    !record.actualEndTime;
  return {
    actualEndTime: record.actualEndTime || (usesPlannedDefaults ? record.plannedEndTime : ""),
    actualStartTime: record.actualStartTime || (usesPlannedDefaults ? record.plannedStartTime : ""),
    breakMinutes: String(usesPlannedDefaults ? 60 : (record.breakMinutes ?? 0)),
    status: record.status,
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

export function AttendancePage({ loginId }: AttendancePageProps) {
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [savedTaskNotes, setSavedTaskNotes] = useState<Record<string, string>>({});
  const [taskNoteDrafts, setTaskNoteDrafts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [savingAssignmentUuid, setSavingAssignmentUuid] = useState<
    string | null
  >(null);
  const [savingScheduleDayUuid, setSavingScheduleDayUuid] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextRecords = await fetchAttendanceRecords(loginId, selectedDate);
      setRecords(nextRecords);
      setDrafts(
        Object.fromEntries(
          nextRecords.map((record) => [
            record.assignmentUuid,
            createDraft(record),
          ]),
        ),
      );
      const nextTaskNotes = Object.fromEntries(
        nextRecords.map((record) => [record.scheduleDayUuid, record.taskNote || ""]),
      );
      setSavedTaskNotes(nextTaskNotes);
      setTaskNoteDrafts(nextTaskNotes);
    } catch (error) {
      setRecords([]);
      setDrafts({});
      setSavedTaskNotes({});
      setTaskNoteDrafts({});
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "근태 기록을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [loginId, selectedDate]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const visibleRecords = useMemo(
    () =>
      statusFilter === "ALL"
        ? records
        : records.filter((record) => record.status === statusFilter),
    [records, statusFilter],
  );

  const groupedRecords = useMemo(() => {
    const groups = new Map<string, AttendanceRecord[]>();
    visibleRecords.forEach((record) => {
      const group = groups.get(record.scheduleDayUuid) ?? [];
      group.push(record);
      groups.set(record.scheduleDayUuid, group);
    });
    return Array.from(groups.values());
  }, [visibleRecords]);

  const summary = useMemo(
    () => ({
      absent: records.filter((record) => record.status === "ABSENT").length,
      cancelled: records.filter((record) => record.status === "CANCELLED")
        .length,
      draft: records.filter((record) => record.status === "DRAFT").length,
      total: records.length,
      worked: records.filter((record) => record.status === "WORKED").length,
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

    setSavingAssignmentUuid(record.assignmentUuid);
    try {
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

  const handleConfirmAll = async () => {
    setIsConfirmingAll(true);
    try {
      const confirmedCount = await confirmPlannedAttendance(loginId, {
        scope: "DATE",
        workDate: selectedDate,
      });
      await loadRecords();
      setStatusMessage(`${confirmedCount}명의 근태를 예정대로 확정했습니다.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "예정 근무를 확정하지 못했습니다.",
      );
    } finally {
      setIsConfirmingAll(false);
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section
        className={styles.attendancePanel}
        aria-labelledby="attendance-title"
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
              records.length === 0
            }
            type="button"
            onClick={() => void handleConfirmAll()}
          >
            {isConfirmingAll ? "확정 중" : "전체 예정대로 근무"}
          </button>
        </header>

        <div className={styles.attendanceDateBar}>
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
            {records.length === 0
              ? "선택한 날짜에 배정된 작업자가 없습니다."
              : "조건에 맞는 근태 기록이 없습니다."}
          </div>
        ) : (
          <div className={styles.attendanceTaskList}>
            {groupedRecords.map((group) => {
              const task = group[0];
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
                    <strong>{group.length}명</strong>
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
                          <th scope="col">저장</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((record) => {
                          const draft =
                            drafts[record.assignmentUuid] ??
                            createDraft(record);
                          const isSaving =
                            savingAssignmentUuid === record.assignmentUuid;
                          const isDirty = !draftMatchesRecord(draft, record);
                          const disablesTime =
                            draft.status === "ABSENT" ||
                            draft.status === "CANCELLED";
                          const hasValidTimes =
                            isValidOptionalTime(draft.actualStartTime) &&
                            isValidOptionalTime(draft.actualEndTime);
                          return (
                            <tr key={record.assignmentUuid}>
                              <td>
                                <div
                                  className={styles.attendanceWorkerIdentity}
                                >
                                  <strong>{record.displayName}</strong>
                                  <span>
                                    {record.pickupLocation || "승차장소 없음"}
                                  </span>
                                  {record.participantType === "guest" && (
                                    <em>익명 참여자</em>
                                  )}
                                </div>
                              </td>
                              <td>{record.area === "men" ? "남자" : "여자"}</td>
                              <td className={styles.plannedTimeCell}>
                                {record.plannedStartTime || "--:--"} -{" "}
                                {record.plannedEndTime || "--:--"}
                              </td>
                              <td>
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
                              <td>
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
                              <td>
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
                              <td>
                                <select
                                  aria-label={`${record.displayName} 근태 상태`}
                                  disabled={isFutureDate}
                                  value={draft.status}
                                  onChange={(event) =>
                                    updateDraft(record.assignmentUuid, {
                                      status: event.target
                                        .value as AttendanceStatus,
                                    })
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
                              <td>
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
                              <td>
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
    </main>
  );
}
