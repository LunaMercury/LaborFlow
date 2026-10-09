import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  fetchAssignmentHistory,
  fetchScheduleTasks,
  type AssignmentHistoryEntry,
  type ScheduleTask,
} from "../api/scheduleApi";
import type { WorkerRow } from "../data/workerRows";
import styles from "./AssignmentHistoryModal.module.css";

type Props = {
  loginId: string;
  workDate: string;
  task: ScheduleTask;
  workers: WorkerRow[];
  onClose: () => void;
  onApply: (source: ScheduleTask, workDate: string) => boolean;
};

function HistoryDialog({ title, onClose, children, inactive = false }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  inactive?: boolean;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <div className={styles.backdrop} onPointerDown={(event) => event.stopPropagation()}>
      <section
        aria-label={title}
        aria-modal={inactive ? undefined : true}
        aria-hidden={inactive ? true : undefined}
        inert={inactive ? true : undefined}
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            closeRef.current();
          }
          if (event.key !== "Tab") return;
          const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), [tabindex='0']",
          );
          if (!controls?.length) { event.preventDefault(); return; }
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
            event.preventDefault(); first.focus();
          }
        }}
      >
        <header className={styles.header}>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>닫기</button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function AssignmentHistoryModal({ loginId, workDate, task, workers, onClose, onApply }: Props) {
  const [entries, setEntries] = useState<AssignmentHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState<{ task: ScheduleTask; date: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [loadingEntry, setLoadingEntry] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadEntries = async (beforeDate?: string) => {
    const version = ++requestVersion.current;
    setIsLoading(true);
    setError("");
    try {
      const page = await fetchAssignmentHistory(loginId, task.id, workDate, beforeDate);
      if (version !== requestVersion.current) return;
      setEntries((current) => beforeDate ? [...current, ...page.entries] : page.entries);
      setCursor(page.nextBeforeDate);
    } catch (caught) {
      if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : "배치 이력을 불러오지 못했습니다.");
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
    return () => { requestVersion.current++; };
  }, [loginId, task.id, workDate]);

  const loadSource = async (entry: AssignmentHistoryEntry, preview: boolean) => {
    const version = ++requestVersion.current;
    setLoadingEntry(entry.scheduleDayUuid);
    setPreviewError("");
    setSource(null);
    setIsPreviewOpen(preview);
    setError("");
    try {
      const tasks = await fetchScheduleTasks(loginId, entry.workDate);
      if (version !== requestVersion.current) return;
      const found = tasks.find((item) => item.id === entry.scheduleDayUuid);
      if (!found) throw new Error("이 배치가 삭제되었거나 더 이상 조회할 수 없습니다.");
      if (preview) setSource({ task: found, date: entry.workDate });
      else if (onApply(found, entry.workDate)) onClose();
    } catch (caught) {
      if (version !== requestVersion.current) return;
      const message = caught instanceof Error ? caught.message : "배치 명단을 불러오지 못했습니다.";
      if (preview) setPreviewError(message); else setError(message);
    } finally {
      if (version === requestVersion.current) setLoadingEntry(null);
    }
  };

  const closePreview = () => {
    requestVersion.current++;
    setLoadingEntry(null);
    setIsPreviewOpen(false);
  };

  return (
    <>
      <HistoryDialog title="배치 불러오기" onClose={onClose} inactive={isPreviewOpen}>
        <div className={styles.body}>
          <p className={styles.notice}>{task.title} / {task.ownerName}</p>
          <p className={styles.notice}>동일 작업의 이전 배치입니다. 불러온 후 체크 버튼을 눌러 저장하세요.</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {!isLoading && !error && entries.length === 0 ? <p className={styles.notice}>불러올 이전 배치가 없습니다.</p> : null}
          <div className={styles.entryList}>
            {entries.map((entry) => (
              <div className={styles.entry} key={entry.scheduleDayUuid}>
                <div className={styles.entryIdentity}>
                  <strong>{entry.workDate}</strong>
                  <small>{entry.siteName} · {entry.assignmentCount}건</small>
                </div>
                <div className={styles.actions}>
                  <button disabled={isLoading || loadingEntry !== null} type="button" aria-label={`${entry.workDate} 배치 미리보기`} onClick={() => void loadSource(entry, true)}>미리보기</button>
                  <button className={styles.applyButton} disabled={isLoading || loadingEntry !== null} type="button" aria-label={`${entry.workDate} 배치 적용`} onClick={() => void loadSource(entry, false)}>적용</button>
                </div>
              </div>
            ))}
          </div>
          {isLoading || loadingEntry ? <p className={styles.notice} role="status">불러오는 중입니다.</p> : null}
          {!isLoading && (cursor || error) ? <button disabled={loadingEntry !== null} type="button" onClick={() => void loadEntries(cursor ?? undefined)}>{error ? "다시 불러오기" : "이전 날짜 더 보기"}</button> : null}
        </div>
      </HistoryDialog>
      {isPreviewOpen ? (
        <HistoryDialog title={source ? `${source.date} 배치 미리보기` : "배치 미리보기"} onClose={closePreview}>
          <div className={styles.body}>
            {loadingEntry ? <p role="status">명단을 불러오는 중입니다.</p> : previewError ? <p className={styles.error} role="alert">{previewError}</p> : source ? (
              <>
                <p className={styles.notice}>{source.task.title} / {source.task.ownerName} · {source.task.siteName}</p>
                <p className={styles.notice}>저장된 배치 명단입니다. 실제 근무 확인 기록과는 다릅니다.</p>
                <div className={styles.previewAreas}>
                  {(["men", "women"] as const).map((area) => {
                    const assignments = source.task.assignments.filter((assignment) => assignment.area === area && assignment.assignmentStatus !== "replaced");
                    return (
                      <section className={styles.previewArea} key={area}>
                        <h3>{area === "men" ? "남자 작업자" : "여자 작업자"}</h3>
                        {assignments.length === 0 ? <p className={styles.notice}>배치 없음</p> : assignments.map((assignment, index) => {
                          const worker = workers.find((item) => item.profileUuid === assignment.workerProfileUuid);
                          return (
                            <div className={styles.previewWorker} key={assignment.assignmentUuid ?? index}>
                              <strong>{worker?.name || worker?.nickname || assignment.displayName || "미등록 작업자"}</strong>
                              <small>{assignment.workerCount}명{assignment.participantType === "guest" ? " · 미등록 인원 (불러오기 제외)" : ""}</small>
                              {worker?.pickupLocation || assignment.pickupLocation ? <small>{worker?.pickupLocation || assignment.pickupLocation}</small> : null}
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
                <div className={styles.actions}>
                  <button className={styles.applyButton} type="button" onClick={() => { if (onApply(source.task, source.date)) onClose(); }}>이 배치 적용</button>
                </div>
              </>
            ) : null}
          </div>
        </HistoryDialog>
      ) : null}
    </>
  );
}
