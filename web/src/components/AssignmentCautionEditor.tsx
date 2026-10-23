import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { fetchClients } from "../api/clientsApi";
import { fetchWorkers } from "../api/workforceApi";
import { cautionRequesterLabels, fetchAssignmentCautions, releaseAssignmentCaution, saveAssignmentCaution, subscribeCautionsChanged,
  type CautionRequester, type WorkerAssignmentCautionChange } from "../api/assignmentCautionsApi";
import { buildWorkerCautionChanges, type CautionEditorRule } from "./assignmentCautionDraft";
import styles from "./AssignmentCautionEditor.module.css";
import { HistoryDialog } from "./AssignmentHistoryModal";

export type AssignmentCautionEditorHandle = { getChanges: () => WorkerAssignmentCautionChange[] };
type Props = { loginId: string; workerProfileUuid?: string; clientProfileUuid?: string;
  deferSave?: boolean; disabled?: boolean; draftRef?: Ref<AssignmentCautionEditorHandle> };
type Candidate = { uuid: string; name: string };

export function AssignmentCautionEditor({ loginId, workerProfileUuid, clientProfileUuid, deferSave = false, disabled = false, draftRef }: Props) {
  const [rules, setRules] = useState<CautionEditorRule[]>([]);
  const initialRules = useRef<CautionEditorRule[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [requester, setRequester] = useState<CautionRequester>("CLIENT");
  const [memo, setMemo] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [releasing, setReleasing] = useState<CautionEditorRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownBusy, setBusy] = useState(false);
  const busy = ownBusy || disabled;
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const version = useRef(0);
  const workerSide = Boolean(workerProfileUuid);
  const refresh = async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const filters = workerProfileUuid ? { workerProfileUuid } : { clientProfileUuid };
      const [nextRules, options] = await Promise.all([
        fetchAssignmentCautions(loginId, filters),
        workerSide ? fetchClients(loginId).then(clients => clients.map(c => ({ uuid: c.profileUuid, name: c.name || c.nickname })))
          : fetchWorkers(loginId).then(workers => workers.filter(w => w.profileUuid).map(w => ({ uuid: w.profileUuid as string, name: w.name || w.nickname || "이름 없음" }))),
      ]);
      if (current !== version.current) return;
      initialRules.current = nextRules;
      setRules(nextRules); setCandidates(options); setError("");
    } catch (caught) {
      if (current === version.current) setError(caught instanceof Error ? caught.message : "배치 주의를 불러오지 못했습니다.");
    } finally { if (current === version.current) setLoading(false); }
  };
  useEffect(() => {
    void refresh();
    // A deferred editor keeps its snapshot until save/cancel; focus events must not erase drafts.
    const unsubscribe = deferSave ? () => {} : subscribeCautionsChanged(() => { void refresh(); });
    return () => { version.current++; unsubscribe(); };
  }, [loginId, workerProfileUuid, clientProfileUuid, deferSave]);

  const reset = () => { setEditing(undefined); setSelected(""); setMemo(""); setQuery(""); setRequester("CLIENT"); setSearchOpen(false); };
  const run = async (action: () => Promise<void>, reload = true) => {
    if (busyRef.current || disabled) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); if (reload) await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "배치 주의를 저장하지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const edit = (rule: CautionEditorRule) => {
    setSearchOpen(false);
    setEditing(rule.uuid); setSelected(workerSide ? rule.clientProfileUuid : rule.workerProfileUuid);
    setRequester(rule.requestedBy); setMemo(rule.memo || "");
  };
  const draftRulesWithInput = () => {
    if (!selected) {
      if (query.trim() || memo.trim()) throw new Error("배치 주의 거래처를 목록에서 선택하거나 입력을 비워 주세요.");
      return rules;
    }
    const previous = rules.find(rule => rule.uuid === editing);
    const name = candidates.find(candidate => candidate.uuid === selected)?.name || "";
    const next: CautionEditorRule = {
      uuid: previous?.uuid || `draft:${selected}`,
      workerProfileUuid: workerProfileUuid || selected, clientProfileUuid: clientProfileUuid || selected,
      workerName: workerSide ? "" : name, clientName: workerSide ? name : "", requestedBy: requester, memo: memo.trim() || null,
    };
    const index = rules.findIndex(rule => rule.clientProfileUuid === next.clientProfileUuid && rule.workerProfileUuid === next.workerProfileUuid);
    return index < 0 ? [...rules, next] : rules.map((rule, position) => position === index ? next : rule);
  };
  useImperativeHandle(draftRef, () => ({
    getChanges: () => {
      if (loading || error || !initialRules.current) throw new Error("배치 주의 거래처를 불러온 뒤 다시 저장해 주세요.");
      return buildWorkerCautionChanges(initialRules.current, draftRulesWithInput());
    },
  }));
  const matches = candidates.filter(c => c.name.replace(/\s/g, "").includes(query.replace(/\s/g, "")));
  const searchVisible = searchOpen && !busy && !loading && !error;
  const activeCandidate = matches[activeIndex];
  const selectCandidate = (candidate: Candidate) => {
    setQuery(candidate.name); setSelected(candidate.uuid); setSearchOpen(false); setActiveIndex(-1);
    const existing = rules.find(r => (workerSide ? r.clientProfileUuid : r.workerProfileUuid) === candidate.uuid);
    if (existing) { edit(existing); setMessage("이미 등록된 관계입니다. 기존 내용을 수정할 수 있습니다."); }
  };
  useEffect(() => {
    if (!searchVisible) return;
    const closeOutside = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [searchVisible]);
  useEffect(() => {
    if (searchVisible && activeCandidate) {
      document.getElementById(`${listId}-${activeCandidate.uuid}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [searchVisible, activeCandidate, listId]);
  return (
    <section className={styles.section} aria-label={workerSide ? "배치 주의 거래처" : "배치 주의 작업자"}>
      <h3>{workerSide ? "배치 주의 거래처" : "배치 주의 작업자"}</h3>
      <p>이 거래처의 모든 현장에 적용됩니다. {deferSave ? "추가·수정·해제는 오른쪽 위 저장을 눌러야 반영됩니다." : "이 영역의 저장·해제는 즉시 반영됩니다."}</p>
      {loading ? <p role="status">배치 주의를 불러오는 중입니다.</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={() => void refresh()}>다시 조회</button></div> : null}
      {message ? <p role="status">{message}</p> : null}
      <div className={styles.ruleList}>
        {rules.map(rule => <div className={styles.rule} key={rule.uuid}>
          <div><strong>{workerSide ? rule.clientName : rule.workerName}</strong><span>{cautionRequesterLabels[rule.requestedBy]}</span>{rule.memo ? <p>{rule.memo}</p> : null}</div>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => edit(rule)}>수정</button>
            <button type="button" disabled={busy} onClick={() => setReleasing(rule)}>해제</button>
          </div>
        </div>)}
        {!loading && !error && rules.length === 0 ? <p>등록된 배치 주의가 없습니다.</p> : null}
      </div>
      <div className={styles.fields}>
        {!editing ? <div className={styles.searchField} ref={searchRef} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
        }}>
          <label htmlFor={`${listId}-input`}>상대 {workerSide ? "거래처" : "작업자"} *</label>
          <input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={searchVisible}
            aria-controls={searchVisible ? listId : undefined}
            aria-activedescendant={searchVisible && activeCandidate ? `${listId}-${activeCandidate.uuid}` : undefined}
            autoComplete="off" placeholder={workerSide ? "거래처 검색 또는 선택" : "작업자 검색 또는 선택"}
            value={query} disabled={busy || loading || Boolean(error)}
            onFocus={() => { setSearchOpen(true); setActiveIndex(-1); }}
            onClick={() => setSearchOpen(true)}
            onChange={event => {
              setQuery(event.target.value); setSelected(""); setSearchOpen(true); setActiveIndex(-1);
            }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" && searchVisible) {
                event.preventDefault(); event.stopPropagation(); setSearchOpen(false); setActiveIndex(-1);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); setSearchOpen(true);
                setActiveIndex(index => matches.length === 0 ? -1 : event.key === "ArrowDown"
                  ? (index + 1) % matches.length : (index <= 0 ? matches.length : index) - 1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (searchVisible && activeCandidate) selectCandidate(activeCandidate);
              }
            }} />
          {searchVisible ? <div className={styles.searchResults} id={listId} role="listbox"
            aria-label={workerSide ? "거래처 선택 목록" : "작업자 선택 목록"}>
            {matches.map((candidate, index) => <button type="button" role="option" key={candidate.uuid}
              id={`${listId}-${candidate.uuid}`} aria-selected={selected === candidate.uuid} tabIndex={-1}
              className={index === activeIndex ? styles.activeOption : undefined}
              onMouseDown={event => event.preventDefault()} onClick={() => selectCandidate(candidate)}>
              {candidate.name}
            </button>)}
            {matches.length === 0 ? <p role="status">{candidates.length === 0 ? "선택할 항목이 없습니다." : "검색 결과가 없습니다."}</p> : null}
          </div> : null}
        </div> : <strong>{candidates.find(c => c.uuid === selected)?.name} 배치 주의 수정</strong>}
        <label>요청 주체<select value={requester} disabled={busy} onChange={e => setRequester(e.target.value as CautionRequester)}>{Object.entries(cautionRequesterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>사유 메모 (선택)<textarea maxLength={500} value={memo} disabled={busy} onChange={e => setMemo(e.target.value)} /></label>
      </div>
      <div className={styles.actions}>
        {editing ? <button type="button" disabled={busy} onClick={reset}>수정 취소</button> : null}
        <button type="button" disabled={busy || loading || !selected} onClick={() => {
          if (deferSave) {
            setRules(draftRulesWithInput()); reset(); setMessage("목록에 반영했습니다. 오른쪽 위 저장을 눌러 완료해 주세요.");
            return;
          }
          void run(async () => {
            const saved = await saveAssignmentCaution(loginId, {
              workerProfileUuid: workerProfileUuid || selected, clientProfileUuid: clientProfileUuid || selected, requestedBy: requester, memo,
            }, editing);
            reset(); setMessage(editing ? "배치 주의를 수정했습니다." : "배치 주의를 저장했습니다.");
            if (!editing && (saved.requestedBy !== requester || (saved.memo || "") !== memo.trim())) setMessage("이미 등록된 관계입니다. 기존 내용을 확인하고 수정해 주세요.");
          });
        }}>{busy ? "저장 중" : deferSave ? editing ? "목록에 수정 반영" : "목록에 추가" : editing ? "배치 주의 수정 저장" : "배치 주의 등록"}</button>
      </div>
      {releasing ? <HistoryDialog title="배치 주의 해제" dismissOnBackdrop onClose={() => { if (!busyRef.current) setReleasing(null); }}>
        <div className={styles.section}><p>이 배치 주의 관계를 해제하시겠습니까? 기존 배치는 변경되지 않습니다.{deferSave ? " 오른쪽 위 저장을 눌러야 해제가 반영됩니다." : ""}</p>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => setReleasing(null)}>취소</button>
            <button className={styles.releaseConfirmButton} type="button" disabled={busy} onClick={() => void run(async () => {
              if (deferSave) setRules(current => current.filter(rule => rule.uuid !== releasing.uuid));
              else await releaseAssignmentCaution(loginId, releasing.uuid);
              if (editing === releasing.uuid) reset();
              setReleasing(null); setMessage(deferSave ? "해제할 목록에 반영했습니다. 오른쪽 위 저장을 눌러 완료해 주세요." : "배치 주의를 해제했습니다.");
            }, !deferSave)}>{busy ? "처리 중" : "해제"}</button>
          </div>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </HistoryDialog> : null}
    </section>
  );
}
