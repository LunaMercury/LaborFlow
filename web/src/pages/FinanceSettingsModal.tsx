import { useEffect, useRef, useState } from "react";
import { fetchClients, type Client } from "../api/clientsApi";
import { fetchWorkers } from "../api/workforceApi";
import { fetchFinanceSettings, saveFinanceSettings, type ClientFinanceOverride, type FinanceSettings, type WorkerFinanceOverride } from "../api/financeApi";
import type { WorkerRow } from "../data/workerRows";
import { HistoryDialog } from "../components/AssignmentHistoryModal";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { CycleInput, Field, ModeInput, MoneyInput } from "./financeControls";
import styles from "./FinancePage.module.css";

export function FinanceSettingsModal({ loginId, onClose, onSaved }: { loginId: string; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<FinanceSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [clientId, setClientId] = useState("");
  const inFlight = useRef(false);
  const confirmDiscard = useUnsavedChangesGuard(settings !== null && JSON.stringify(settings) !== saved);
  const load = () => {
    setError("");
    void fetchFinanceSettings(loginId).then(result => { setSettings(result); setSaved(JSON.stringify(result)); }).catch(caught => setError((caught as Error).message));
  };
  useEffect(() => { load(); void fetchWorkers(loginId).then(setWorkers).catch(() => setError("작업자 목록을 불러오지 못했습니다. 기존 설정은 유지됩니다.")); void fetchClients(loginId).then(setClients).catch(() => setError("거래처 목록을 불러오지 못했습니다. 기존 설정은 유지됩니다.")); }, [loginId]);
  const close = () => { if (!inFlight.current && confirmDiscard()) onClose(); };
  const update = (values: Partial<FinanceSettings>) => setSettings(current => current ? { ...current, ...values } : current);
  const workerUpdate = (id: string, values: Partial<WorkerFinanceOverride>) => { if (settings) update({ workerOverrides: settings.workerOverrides.map(row => row.workerProfileUuid === id ? { ...row, ...values } : row) }); };
  const clientUpdate = (id: string, values: Partial<ClientFinanceOverride>) => { if (settings) update({ clientOverrides: settings.clientOverrides.map(row => row.clientProfileUuid === id ? { ...row, ...values } : row) }); };
  const save = async () => {
    if (!settings || inFlight.current) return;
    if (!reason.trim()) { setError("설정 변경 사유를 입력하세요."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try { await saveFinanceSettings(loginId, settings, reason.trim()); onSaved(); onClose(); }
    catch (caught) { setError((caught as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return <HistoryDialog title="정산 기본값·지급 주기" onClose={close}><div className={styles.financeModalForm} inert={busy ? true : undefined}>
    {error ? <p className={styles.financeErrorMessage} role="alert">{error}</p> : null}
    {!settings ? <><p>설정을 불러오는 중입니다.</p><button className={styles.financeSecondaryButton} onClick={load} type="button">다시 불러오기</button></> : <>
      <p className={styles.financeNoticeMessage}>새 초안을 생성할 때 적용합니다. 이미 저장된 작업 금액과 지급예정일은 변경하지 않습니다.</p>
      <h3>사무소 기본값</h3><ModeInput value={settings.defaultMode} onChange={defaultMode => update({ defaultMode })} /><div className={styles.financeFormGrid}><MoneyInput label="농가 청구·소개료 단가" value={settings.defaultChargeRate} onChange={defaultChargeRate => update({ defaultChargeRate })} /><MoneyInput label="작업자 지급 단가" value={settings.defaultPayRate} onChange={defaultPayRate => update({ defaultPayRate })} /></div><CycleInput cycle={settings.payoutCycle} weekday={settings.weeklyPayday} date={settings.customDueDate} onChange={(payoutCycle, weeklyPayday, customDueDate) => update({ payoutCycle, weeklyPayday, customDueDate })} />
      <section className={styles.financeFormSection}><h3>거래처별 기본값</h3><div className={styles.financeFormGrid}><Field label="거래처"><select value={clientId} onChange={event => setClientId(event.target.value)}><option value="">거래처 선택</option>{clients.filter(client => !settings.clientOverrides.some(row => row.clientProfileUuid === client.profileUuid)).map(client => <option key={client.profileUuid} value={client.profileUuid}>{client.name || client.nickname || client.businessName}</option>)}</select></Field><button className={styles.financeSecondaryButton} disabled={!clientId || busy} type="button" onClick={() => { update({ clientOverrides: [...settings.clientOverrides, { clientProfileUuid: clientId, defaultMode: null, chargeRate: null, payRate: null }] }); setClientId(""); }}>거래처 기본값 추가</button></div>
      {settings.clientOverrides.map(row => <div className={styles.financeRecordCard} key={row.clientProfileUuid}><div className={styles.financeRowHeader}><strong>{clients.find(client => client.profileUuid === row.clientProfileUuid)?.name ?? row.clientProfileUuid}</strong><button className={styles.financeDangerButton} disabled={busy} type="button" onClick={() => update({ clientOverrides: settings.clientOverrides.filter(item => item !== row) })}>예외 해제</button></div><Field label="지급 방식"><select value={row.defaultMode ?? ""} onChange={event => clientUpdate(row.clientProfileUuid, { defaultMode: event.target.value as ClientFinanceOverride["defaultMode"] || null })}><option value="">사무소 기본값</option><option value="OFFICE">사무소 수납·지급</option><option value="DIRECT">농가 직접 지급</option></select></Field><div className={styles.financeFormGrid}><MoneyInput label="청구·소개료 단가 · 비우면 기본값" value={row.chargeRate} onChange={chargeRate => clientUpdate(row.clientProfileUuid, { chargeRate })} /><MoneyInput label="작업자 지급 단가 · 비우면 기본값" value={row.payRate} onChange={payRate => clientUpdate(row.clientProfileUuid, { payRate })} /></div></div>)}</section>
      <section className={styles.financeFormSection}><h3>작업자별 예외</h3><div className={styles.financeFormGrid}><Field label="작업자"><select value={workerId} onChange={event => setWorkerId(event.target.value)}><option value="">작업자 선택</option>{workers.filter(worker => worker.profileUuid && !settings.workerOverrides.some(row => row.workerProfileUuid === worker.profileUuid)).map(worker => <option value={worker.profileUuid} key={worker.profileUuid}>{worker.name || worker.nickname}</option>)}</select></Field><button className={styles.financeSecondaryButton} disabled={!workerId || busy} type="button" onClick={() => { update({ workerOverrides: [...settings.workerOverrides, { workerProfileUuid: workerId, defaultMode: null, chargeRate: null, payRate: null, payoutCycle: settings.payoutCycle, weeklyPayday: settings.weeklyPayday, customDueDate: settings.customDueDate }] }); setWorkerId(""); }}>작업자 예외 추가</button></div>
      {settings.workerOverrides.map(row => <div className={styles.financeRecordCard} key={row.workerProfileUuid}><div className={styles.financeRowHeader}><strong>{workers.find(worker => worker.profileUuid === row.workerProfileUuid)?.name ?? row.workerProfileUuid}</strong><button className={styles.financeDangerButton} disabled={busy} type="button" onClick={() => update({ workerOverrides: settings.workerOverrides.filter(item => item !== row) })}>예외 해제</button></div><Field label="지급 방식"><select value={row.defaultMode ?? ""} onChange={event => workerUpdate(row.workerProfileUuid, { defaultMode: event.target.value as WorkerFinanceOverride["defaultMode"] || null })}><option value="">거래처·사무소 기본값</option><option value="OFFICE">사무소 수납·지급</option><option value="DIRECT">농가 직접 지급</option></select></Field><div className={styles.financeFormGrid}><MoneyInput label="청구·소개료 단가 · 비우면 기본값" value={row.chargeRate} onChange={chargeRate => workerUpdate(row.workerProfileUuid, { chargeRate })} /><MoneyInput label="작업자 지급 단가 · 비우면 기본값" value={row.payRate} onChange={payRate => workerUpdate(row.workerProfileUuid, { payRate })} /></div><CycleInput cycle={row.payoutCycle} weekday={row.weeklyPayday} date={row.customDueDate} onChange={(payoutCycle, weeklyPayday, customDueDate) => workerUpdate(row.workerProfileUuid, { payoutCycle, weeklyPayday, customDueDate })} /></div>)}</section>
      <Field label="설정 변경 사유 *"><textarea value={reason} onChange={event => setReason(event.target.value)} /></Field><button className={styles.financePrimaryButton} disabled={busy} type="button" onClick={() => void save()}>{busy ? "저장 중" : "기본값 저장"}</button>
    </>}
  </div></HistoryDialog>;
}
