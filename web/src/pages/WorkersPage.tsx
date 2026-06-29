import { useEffect, useMemo, useState } from "react";
import {
  fetchWorkers,
  fetchWorkTypes,
  updateWorkerPickupLocation as saveWorkerPickupLocation,
  updateWorkerWorkTypes as saveWorkerWorkTypes,
} from "../api/workforceApi";
import appStyles from "../App.module.css";
import { EditableTextCell, EditableWorkerNameCell } from "../components/WorkerEditableCells";
import { WorkerProfileModal } from "../components/WorkerProfileModal";
import { WorkerWorkTypeCell } from "../components/WorkerWorkTypeCell";
import { workTypeOptions as fallbackWorkTypeOptions } from "../data/workTypeOptions";
import type { WorkerRow } from "../data/workerRows";
import { getPhoneDigits } from "../utils/phoneNumber";
import workersStyles from "./WorkersPage.module.css";

const styles = { ...appStyles, ...workersStyles };

type WorkersPageProps = {
  loginId: string;
  onNavigate: (path: string) => void;
};

type WorkerProfileModalState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      worker: WorkerRow;
    };

type WorkerSearchInputProps = {
  resultCount: number;
  totalCount: number;
  onSearchTextChange: (searchText: string) => void;
};

function normalizeWorkerSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function workerMatchesSearch(worker: WorkerRow, searchText: string) {
  const normalizedSearchText = normalizeWorkerSearchText(searchText);
  const searchPhoneDigits = getPhoneDigits(searchText);

  if (!normalizedSearchText && !searchPhoneDigits) {
    return true;
  }

  const searchableNames = [
    worker.name,
    worker.nickname ?? "",
  ].map(normalizeWorkerSearchText);
  const workerPhoneDigits = getPhoneDigits(worker.phone);

  return (
    searchableNames.some((name) => name.includes(normalizedSearchText)) ||
    Boolean(searchPhoneDigits && workerPhoneDigits.includes(searchPhoneDigits))
  );
}

function WorkerSearchInput({
  resultCount,
  totalCount,
  onSearchTextChange,
}: WorkerSearchInputProps) {
  const [draftSearchText, setDraftSearchText] = useState("");

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      onSearchTextChange(draftSearchText);
    }, 160);

    return () => window.clearTimeout(debounceTimer);
  }, [draftSearchText, onSearchTextChange]);

  return (
    <div className={styles.workerSearchPanel}>
      <label className={styles.workerSearchField}>
        <span>작업자 검색</span>
        <input
          aria-label="작업자 이름 또는 전화번호 검색"
          placeholder="이름, 호칭, 전화번호 검색"
          type="search"
          value={draftSearchText}
          onChange={(event) => setDraftSearchText(event.target.value)}
        />
      </label>
      <span className={styles.workerSearchCount}>
        {resultCount} / {totalCount} 명
      </span>
    </div>
  );
}

export function WorkersPage({ loginId, onNavigate }: WorkersPageProps) {
  const [profileModalState, setProfileModalState] =
    useState<WorkerProfileModalState | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [workerSearchText, setWorkerSearchText] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const filteredWorkers = useMemo(
    () =>
      workers
        .map((worker, workerIndex) => ({ worker, workerIndex }))
        .filter(({ worker }) => workerMatchesSearch(worker, workerSearchText)),
    [workerSearchText, workers],
  );

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchWorkers(loginId), fetchWorkTypes()])
      .then(([nextWorkers, nextWorkTypes]) => {
        if (!isMounted) {
          return;
        }

        setWorkers(nextWorkers);
        setWorkTypes(nextWorkTypes);
        setStatusMessage("");
      })
      .catch(() => {
        if (isMounted) {
          setWorkers([]);
          setStatusMessage("DB 데이터를 불러오지 못했습니다.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loginId]);

  const updateWorkerWorkTypes = async (
    workerIndex: number,
    nextWorkTypeCodes: string[],
    nextWorkTypeRatings: Record<string, number>,
  ) => {
    const worker = workers[workerIndex];
    const previousWorkers = workers;

    setWorkers((currentWorkers) =>
      currentWorkers.map((worker, index) =>
        index === workerIndex
          ? {
              ...worker,
              workTypeCodes: nextWorkTypeCodes,
              workTypeRatings: nextWorkTypeRatings,
            }
          : worker,
      ),
    );

    if (!worker.profileUuid) {
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      const savedWorkers = await saveWorkerWorkTypes(
        loginId,
        worker.profileUuid,
        nextWorkTypeCodes,
        nextWorkTypeRatings,
      );
      setWorkers(savedWorkers);
      setStatusMessage("가능한 작업을 DB에 저장했습니다.");
    } catch {
      setWorkers(previousWorkers);
      setStatusMessage("가능한 작업 저장에 실패했습니다.");
    }
  };

  const updateWorkerPickupLocation = async (workerIndex: number, pickupLocation: string) => {
    const worker = workers[workerIndex];
    if (!worker.profileUuid) {
      setWorkers((currentWorkers) =>
        currentWorkers.map((currentWorker, index) =>
          index === workerIndex ? { ...currentWorker, pickupLocation } : currentWorker,
        ),
      );
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      setWorkers(await saveWorkerPickupLocation(loginId, worker.profileUuid, pickupLocation));
      setStatusMessage("승차장소를 DB에 저장했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "승차장소를 저장하지 못했습니다.");
      throw error;
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section className={styles.workersPanel} aria-labelledby="workers-title">
        <div className={styles.workersPageHeader}>
          <div className={styles.workersHeading}>
            <div className={styles.workersMetaRow}>
              <p className={styles.sectionLabel}>인력 현황</p>
              <span className={styles.workersCountText}>
                등록 인력 : {workers.length} 명
              </span>
            </div>
            <h1 id="workers-title">작업자 목록</h1>
            {statusMessage ? (
              <p className={styles.workersStatusMessage}>{statusMessage}</p>
            ) : null}
          </div>
          <div className={styles.workersHeaderActions}>
            <button
              className={styles.goToTeamsButton}
              type="button"
              onClick={() => onNavigate("/teams")}
            >
              팀 목록으로 &gt;
            </button>
            <button
              className={styles.registerWorkerButton}
              type="button"
              onClick={() => setProfileModalState({ mode: "create" })}
            >
              인력 등록 +
            </button>
          </div>
        </div>

        <WorkerSearchInput
          resultCount={filteredWorkers.length}
          totalCount={workers.length}
          onSearchTextChange={setWorkerSearchText}
        />

        <div className={styles.workerTableFrame}>
          <table className={styles.workerTable}>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">전화번호</th>
                <th scope="col">가능한 작업</th>
                <th scope="col">승차장소</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.map(({ worker, workerIndex }) => (
                <tr key={worker.profileUuid ?? `${worker.name}-${worker.phone}-${workerIndex}`}>
                  <td>
                    <EditableWorkerNameCell
                      name={worker.name}
                      nickname={worker.nickname}
                      onOpenProfile={() =>
                        setProfileModalState({ mode: "edit", worker })
                      }
                    />
                  </td>
                  <td>
                    <span className={styles.workerPhoneText}>{worker.phone || "-"}</span>
                  </td>
                  <td className={styles.workTypeTableCell}>
                    <WorkerWorkTypeCell
                      selectedCodes={worker.workTypeCodes}
                      selectedRatings={worker.workTypeRatings}
                      workTypeOptions={workTypes}
                      onChange={(nextWorkTypeCodes, nextWorkTypeRatings) =>
                        updateWorkerWorkTypes(
                          workerIndex,
                          nextWorkTypeCodes,
                          nextWorkTypeRatings,
                        )
                      }
                    />
                  </td>
                  <td>
                    <EditableTextCell
                      ariaLabel="승차장소"
                      value={worker.pickupLocation}
                      onSave={(pickupLocation) =>
                        updateWorkerPickupLocation(workerIndex, pickupLocation)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {profileModalState ? (
        <WorkerProfileModal
          loginId={loginId}
          mode={profileModalState.mode}
          worker={
            profileModalState.mode === "edit"
              ? profileModalState.worker
              : undefined
          }
          workTypeOptions={workTypes}
          onClose={() => setProfileModalState(null)}
          onSaved={(nextWorkers) => {
            setWorkers(nextWorkers);
            setStatusMessage(
              profileModalState.mode === "edit"
                ? "작업자 정보를 DB에 저장했습니다."
                : "작업자를 DB에 등록했습니다.",
            );
          }}
        />
      ) : null}
    </main>
  );
}
