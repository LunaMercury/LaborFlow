import { useMemo, useState, type FormEvent } from "react";
import {
  createWorkerTeam,
  updateWorkerTeam,
  type CreateWorkerTeamPayload,
} from "../api/workforceApi";
import type { WorkerRow } from "../data/workerRows";
import styles from "./TeamCompositionModal.module.css";

export type EditableWorkerTeam = {
  name: string;
  uuid: string;
  workers: WorkerRow[];
};

type TeamCompositionModalMode = "create" | "edit";

type TeamCompositionModalProps = {
  loginId: string;
  mode: TeamCompositionModalMode;
  team?: EditableWorkerTeam;
  workers: WorkerRow[];
  onClose: () => void;
  onSaved: (workers: WorkerRow[]) => void;
};

function getWorkerId(worker: WorkerRow) {
  return worker.profileUuid ?? "";
}

function getWorkerDisplayName(worker: WorkerRow) {
  return worker.name || worker.nickname || "이름 없음";
}

function getWorkerSearchText(worker: WorkerRow) {
  return [
    worker.name,
    worker.nickname,
    worker.phone,
    worker.pickupLocation,
    worker.teamName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildTeamConflictMessage(conflictingWorkers: WorkerRow[]) {
  return [
    "경고! 아래 인원은 이미 다른 팀에 등록되어 있습니다.",
    "이대로 진행할 경우 이전 소속되어 있던 팀에서 제외됩니다.",
    "",
    ...conflictingWorkers.map(
      (worker) => `${getWorkerDisplayName(worker)} - ${worker.teamName}`,
    ),
    "",
    "진행하시겠습니까?",
  ].join("\n");
}

export function TeamCompositionModal({
  loginId,
  mode,
  team,
  workers,
  onClose,
  onSaved,
}: TeamCompositionModalProps) {
  const formId = `team-composition-${mode}-form`;
  const isEditMode = mode === "edit";
  const [teamName, setTeamName] = useState(team?.name ?? "");
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>(
    () => team?.workers.map(getWorkerId).filter(Boolean) ?? [],
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [workerSearchText, setWorkerSearchText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const workersById = useMemo(() => {
    const nextWorkersById = new Map<string, WorkerRow>();
    for (const worker of workers) {
      const workerId = getWorkerId(worker);
      if (workerId) {
        nextWorkersById.set(workerId, worker);
      }
    }

    return nextWorkersById;
  }, [workers]);

  const selectedWorkers = selectedWorkerIds
    .map((workerId) => workersById.get(workerId))
    .filter((worker): worker is WorkerRow => Boolean(worker));

  const conflictingWorkers = selectedWorkers.filter(
    (worker) =>
      worker.teamUuid &&
      worker.teamName &&
      (!isEditMode || worker.teamUuid !== team?.uuid),
  );

  const availableWorkers = useMemo(() => {
    const selectedWorkerIdSet = new Set(selectedWorkerIds);
    const normalizedSearchText = workerSearchText.trim().toLowerCase();

    return workers
      .filter((worker) => {
        const workerId = getWorkerId(worker);
        if (!workerId || selectedWorkerIdSet.has(workerId)) {
          return false;
        }

        if (!normalizedSearchText) {
          return true;
        }

        return getWorkerSearchText(worker).includes(normalizedSearchText);
      })
      .slice(0, 8);
  }, [selectedWorkerIds, workerSearchText, workers]);

  const addWorker = (worker: WorkerRow) => {
    const workerId = getWorkerId(worker);
    if (!workerId) {
      return;
    }

    setSelectedWorkerIds((currentWorkerIds) =>
      currentWorkerIds.includes(workerId)
        ? currentWorkerIds
        : [...currentWorkerIds, workerId],
    );
    setWorkerSearchText("");
    setIsSearchOpen(false);
  };

  const removeWorker = (workerId: string) => {
    setSelectedWorkerIds((currentWorkerIds) =>
      currentWorkerIds.filter((currentWorkerId) => currentWorkerId !== workerId),
    );
  };

  const saveTeam = async (payload: CreateWorkerTeamPayload) => {
    setIsSubmitting(true);
    try {
      const nextWorkers =
        isEditMode && team
          ? await updateWorkerTeam(loginId, team.uuid, payload)
          : await createWorkerTeam(loginId, payload);
      onSaved(nextWorkers);
      onClose();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : isEditMode
            ? "팀을 수정하지 못했습니다."
            : "팀을 구성하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedTeamName = teamName.trim();
    if (!normalizedTeamName) {
      window.alert("팀명을 입력해주세요.");
      return;
    }

    if (selectedWorkerIds.length === 0) {
      window.alert("팀원을 한 명 이상 선택해주세요.");
      return;
    }

    const payload = {
      teamName: normalizedTeamName,
      workerProfileUuids: selectedWorkerIds,
    };

    if (conflictingWorkers.length > 0) {
      const shouldContinue = window.confirm(
        buildTeamConflictMessage(conflictingWorkers),
      );
      if (!shouldContinue) {
        return;
      }
    }

    await saveTeam(payload);
  };

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="team-composition-title"
        aria-modal="true"
        className={styles.teamCompositionDialog}
        role="dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.sectionLabel}>팀 목록</p>
            <h2 id="team-composition-title">
              {isEditMode ? "팀 수정하기" : "팀 구성하기"}
            </h2>
          </div>
          <div className={styles.modalHeaderActions}>
            <button
              className={styles.primaryActionButton}
              disabled={isSubmitting}
              form={formId}
              type="submit"
            >
              {isEditMode ? "저장" : "등록"}
            </button>
            <button
              className={styles.secondaryActionButton}
              disabled={isSubmitting}
              type="button"
              onClick={onClose}
            >
              취소
            </button>
          </div>
        </div>

        <form
          className={styles.teamCompositionForm}
          id={formId}
          onSubmit={handleSubmit}
        >
          <label className={styles.formField}>
            <span>
              팀명 <strong className={styles.requiredMark}>*</strong>
            </span>
            <input
              autoFocus
              placeholder="예: 김철수 팀"
              type="text"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
            />
          </label>

          <div className={styles.teamMemberSection}>
            <span className={styles.teamMemberLabel}>팀원</span>
            <div className={styles.selectedWorkerList}>
              {selectedWorkers.map((worker) => {
                const workerId = getWorkerId(worker);

                return (
                  <div className={styles.selectedWorkerRow} key={workerId}>
                    <div className={styles.selectedWorkerText}>
                      <strong>{getWorkerDisplayName(worker)}</strong>
                      {worker.nickname && worker.name ? (
                        <span>- {worker.nickname}</span>
                      ) : null}
                      {worker.teamName ? (
                        <span className={styles.workerTeamHint}>
                          {worker.teamName}
                        </span>
                      ) : null}
                    </div>
                    <button
                      aria-label={`${getWorkerDisplayName(worker)} 팀원 제외`}
                      className={styles.removeWorkerButton}
                      type="button"
                      onClick={() => removeWorker(workerId)}
                    >
                      -
                    </button>
                  </div>
                );
              })}

              <div className={styles.workerSearchArea}>
                {isSearchOpen ? (
                  <>
                    <input
                      className={styles.workerSearchInput}
                      placeholder="작업자 이름 검색"
                      type="text"
                      value={workerSearchText}
                      onChange={(event) => setWorkerSearchText(event.target.value)}
                    />
                    <div className={styles.workerSearchDropdown}>
                      {availableWorkers.length > 0 ? (
                        availableWorkers.map((worker) => (
                          <button
                            className={styles.workerSearchOption}
                            key={getWorkerId(worker)}
                            type="button"
                            onClick={() => addWorker(worker)}
                          >
                            <strong>{getWorkerDisplayName(worker)}</strong>
                            <span>
                              {worker.teamName
                                ? `${worker.teamName} · ${worker.pickupLocation || "승차장소 없음"}`
                                : worker.pickupLocation || "승차장소 없음"}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className={styles.emptySearchResult}>
                          검색 가능한 작업자가 없습니다.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <button
                    className={styles.addWorkerButton}
                    type="button"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>

      </section>
    </div>
  );
}
