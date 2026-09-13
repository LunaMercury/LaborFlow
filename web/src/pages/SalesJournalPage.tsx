import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createSalesJournal,
  deleteSalesJournal,
  fetchSalesJournal,
  fetchSalesJournals,
  updateSalesJournal,
  type SalesJournal,
} from "../api/journalApi";
import appStyles from "../App.module.css";
import { StatusSnackbar } from "../components/StatusSnackbar";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import styles from "./JournalPages.module.css";

type SalesJournalPageProps = {
  loginId: string;
};

type SalesJournalDraft = {
  activityAt: string;
  content: string;
};

function businessNowInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

function toInputDateTime(value: string) {
  return value ? value.slice(0, 16) : businessNowInputValue();
}

function formatActivityAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function createDraft(journal?: SalesJournal): SalesJournalDraft {
  return {
    activityAt: journal ? toInputDateTime(journal.activityAt) : businessNowInputValue(),
    content: journal?.content ?? "",
  };
}

export function SalesJournalPage({ loginId }: SalesJournalPageProps) {
  const [journals, setJournals] = useState<SalesJournal[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [draft, setDraft] = useState<SalesJournalDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<SalesJournalDraft | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    fromDate: "",
    query: "",
    toDate: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const isDirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft],
  );
  const confirmDiscard = useUnsavedChangesGuard(isDirty);

  const loadJournals = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      setJournals(await fetchSalesJournals(loginId, appliedFilters));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "영업일지를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, loginId]);

  useEffect(() => {
    void loadJournals();
  }, [loadJournals]);

  const startNewJournal = () => {
    if (!confirmDiscard()) return;
    const nextDraft = createDraft();
    setSelectedUuid(null);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
  };

  const openJournal = async (journalUuid: string) => {
    if (journalUuid === selectedUuid || !confirmDiscard()) return;
    setIsDetailLoading(true);
    try {
      const journal = await fetchSalesJournal(loginId, journalUuid);
      const nextDraft = createDraft(journal);
      setSelectedUuid(journal.uuid);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "영업일지를 불러오지 못했습니다.");
    } finally {
      setIsDetailLoading(false);
    }
  };

  const saveJournal = async () => {
    if (!draft || isSaving) return;
    if (!draft.content.trim()) {
      setStatusMessage("영업 내용을 입력해주세요.");
      return;
    }
    setIsSaving(true);
    try {
      const payload = { activityAt: draft.activityAt, content: draft.content };
      const saved = selectedUuid
        ? await updateSalesJournal(loginId, selectedUuid, payload)
        : await createSalesJournal(loginId, payload);
      const nextDraft = createDraft(saved);
      setSelectedUuid(saved.uuid);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setStatusMessage("영업일지를 저장했습니다.");
      await loadJournals();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "영업일지를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeJournal = async () => {
    if (!selectedUuid || isSaving) return;
    if (!window.confirm("이 영업일지를 삭제하시겠습니까? 일지 기록만 목록에서 제외됩니다.")) return;
    setIsSaving(true);
    try {
      await deleteSalesJournal(loginId, selectedUuid);
      setSelectedUuid(null);
      setDraft(null);
      setSavedDraft(null);
      setStatusMessage("영업일지를 삭제했습니다.");
      await loadJournals();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "영업일지를 삭제하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={appStyles.tableMainContent}>
      <section className={styles.journalPanel} aria-labelledby="sales-journal-title">
        <div className={styles.journalHeader}>
          <div>
            <p className={styles.sectionLabel}>영업일지</p>
            <h1 id="sales-journal-title">현장 영업 기록</h1>
          </div>
          <div className={styles.journalHeaderActions}>
            <button className={styles.primaryButton} type="button" onClick={startNewJournal}>새 일지</button>
          </div>
        </div>

        <form className={styles.filterBar} onSubmit={(event) => { event.preventDefault(); setAppliedFilters({ fromDate, toDate, query: query.trim() }); }}>
          <label className={styles.filterField}><span>시작일</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className={styles.filterField}><span>종료일</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
          <label className={`${styles.filterField} ${styles.searchField}`}><span>본문 검색</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지역, 작물, 통화 내용 검색" /></label>
          <button className={styles.primaryButton} type="submit">조회</button>
        </form>

        <div className={styles.journalWorkspace}>
          <section className={styles.listPanel} aria-label="영업일지 목록">
            <h2 className={styles.panelHeading}>날짜 기준 최신순</h2>
            {isLoading ? <div className={styles.loadingState}>불러오는 중입니다.</div> : loadError ? <div className={styles.errorState}>{loadError}</div> : journals.length === 0 ? <div className={styles.emptyState}>{fromDate || toDate || query ? "검색 결과가 없습니다." : "작성된 영업일지가 없습니다."}</div> : (
              <div className={styles.journalList}>
                {journals.map((journal) => (
                  <button className={`${styles.listItem} ${selectedUuid === journal.uuid ? styles.activeListItem : ""}`} key={journal.uuid} type="button" onClick={() => void openJournal(journal.uuid)}>
                    <span className={styles.listDate}>{formatActivityAt(journal.activityAt)}</span>
                    <span className={styles.listExcerpt}>{journal.content}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className={styles.editorPanel} aria-label="영업일지 작성 및 상세">
            {isDetailLoading ? <div className={styles.loadingState}>상세 내용을 불러오는 중입니다.</div> : draft ? (
              <>
                <label className={styles.field}><span>활동 일시 *</span><input required type="datetime-local" value={draft.activityAt} onChange={(event) => setDraft((current) => current ? { ...current, activityAt: event.target.value } : current)} /></label>
                <label className={styles.field}><span>영업 내용 *</span><textarea required value={draft.content} onChange={(event) => setDraft((current) => current ? { ...current, content: event.target.value } : current)} placeholder="여러 지역의 작물 상태, 들은 작업 시기, 통화 내용과 잠재 작업을 자유롭게 기록하세요." /></label>
                <div className={styles.editorActions}>
                  {selectedUuid ? <button className={styles.dangerButton} disabled={isSaving} type="button" onClick={() => void removeJournal()}>삭제</button> : null}
                  <button className={styles.secondaryButton} disabled={isSaving} type="button" onClick={() => { if (confirmDiscard()) { setDraft(null); setSavedDraft(null); setSelectedUuid(null); } }}>취소</button>
                  <button className={styles.primaryButton} disabled={isSaving} type="button" onClick={() => void saveJournal()}>{isSaving ? "저장 중" : "저장"}</button>
                </div>
              </>
            ) : <div className={styles.emptyState}>목록에서 일지를 선택하거나 새 일지를 작성하세요.</div>}
          </section>
        </div>
      </section>
      <StatusSnackbar message={statusMessage} onDismiss={() => setStatusMessage("")} />
    </main>
  );
}
