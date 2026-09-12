import { useEffect, useMemo, useRef, useState } from "react";
import {
  createWorkType,
  fetchWorkers,
  fetchWorkTypes,
  updateWorkerPickupLocation as saveWorkerPickupLocation,
  updateWorkerWorkTypes as saveWorkerWorkTypes,
} from "../api/workforceApi";
import appStyles from "../App.module.css";
import { EditableTextCell, EditableWorkerNameCell } from "../components/WorkerEditableCells";
import { WorkerProfileModal } from "../components/WorkerProfileModal";
import { WorkerWorkTypeCell } from "../components/WorkerWorkTypeCell";
import {
  workTypeOptions as fallbackWorkTypeOptions,
  type WorkTypeOption,
} from "../data/workTypeOptions";
import type { WorkerRow } from "../data/workerRows";
import { getPhoneDigits } from "../utils/phoneNumber";
import workersStyles from "./WorkersPage.module.css";

const styles = { ...appStyles, ...workersStyles };
const WORKERS_PER_PAGE = 15;

type WorkerSortKey = "name" | "phone" | "work" | "pickupLocation" | "recentWork";
type SortDirection = "asc" | "desc";
type WorkerStatusFilter = "all" | "active" | "resting";

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

type WorkerListControlsProps = {
  sortDirection: SortDirection;
  sortKey: WorkerSortKey;
  statusFilter: WorkerStatusFilter;
  workTypeFilter: string;
  workTypes: WorkTypeOption[];
  onSortDirectionChange: (sortDirection: SortDirection) => void;
  onSortKeyChange: (sortKey: WorkerSortKey) => void;
  onStatusFilterChange: (statusFilter: WorkerStatusFilter) => void;
  onWorkTypeFilterChange: (workTypeCode: string) => void;
};

type PaginationControlsProps = {
  currentPage: number;
  pageCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
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

function getWorkerDisplayName(worker: WorkerRow) {
  return worker.name.trim() || worker.nickname?.trim() || "";
}

function getWorkerWorkTypeNames(worker: WorkerRow, workTypes: WorkTypeOption[]) {
  return worker.workTypeCodes
    .map((code) => workTypes.find((workType) => workType.code === code)?.name ?? code)
    .join(", ");
}

function workerMatchesStatusFilter(worker: WorkerRow, statusFilter: WorkerStatusFilter) {
  if (statusFilter === "active") {
    return worker.isActive !== false;
  }

  if (statusFilter === "resting") {
    return worker.isActive === false;
  }

  return true;
}

function compareWorkers(
  leftWorker: WorkerRow,
  rightWorker: WorkerRow,
  sortKey: WorkerSortKey,
  sortDirection: SortDirection,
  workTypes: WorkTypeOption[],
) {
  const direction = sortDirection === "asc" ? 1 : -1;
  const getSortValue = (worker: WorkerRow) => {
    switch (sortKey) {
      case "phone":
        return getPhoneDigits(worker.phone);
      case "work":
        return getWorkerWorkTypeNames(worker, workTypes);
      case "pickupLocation":
        return worker.pickupLocation;
      case "recentWork":
        return worker.lastWorkedDate ?? "";
      case "name":
      default:
        return getWorkerDisplayName(worker);
    }
  };

  return (
    getSortValue(leftWorker).localeCompare(getSortValue(rightWorker), "ko-KR") *
    direction
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

function WorkerListControls({
  sortDirection,
  sortKey,
  statusFilter,
  workTypeFilter,
  workTypes,
  onSortDirectionChange,
  onSortKeyChange,
  onStatusFilterChange,
  onWorkTypeFilterChange,
}: WorkerListControlsProps) {
  const sortOptions: Array<{ key: WorkerSortKey; label: string; disabled?: boolean }> = [
    { key: "name", label: "이름" },
    { key: "phone", label: "전화번호" },
    { key: "work", label: "작업" },
    { key: "pickupLocation", label: "승차장소" },
    { key: "recentWork", label: "최근 근무" },
  ];

  return (
    <div className={styles.workerListControls}>
      <div className={styles.workerControlGroup}>
        <span>정렬</span>
        <div className={styles.workerSortButtonGroup}>
          {sortOptions.map((option) => (
            <button
              className={
                sortKey === option.key
                  ? styles.activeWorkerControlButton
                  : styles.workerControlButton
              }
              key={option.key}
              type="button"
              onClick={() => {
                onSortKeyChange(option.key);
                if (option.key === "recentWork") {
                  onSortDirectionChange("desc");
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          className={styles.workerDirectionButton}
          type="button"
          onClick={() =>
            onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")
          }
        >
          {sortDirection === "asc" ? "오름차순" : "내림차순"}
        </button>
      </div>

      <div className={styles.workerControlGroup}>
        <span>필터</span>
        <select
          aria-label="작업자 상태 필터"
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as WorkerStatusFilter)
          }
        >
          <option value="all">전체 상태</option>
          <option value="active">활성 작업자</option>
          <option value="resting">휴식중</option>
        </select>
        <select
          aria-label="가능 작업 필터"
          value={workTypeFilter}
          onChange={(event) => onWorkTypeFilterChange(event.target.value)}
        >
          <option value="">전체 작업</option>
          {workTypes.map((workType) => (
            <option key={workType.code} value={workType.code}>
              {workType.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PaginationControls({
  currentPage,
  pageCount,
  totalCount,
  onPageChange,
}: PaginationControlsProps) {
  return (
    <div className={styles.workerPaginationBar}>
      <span>
        페이지 {currentPage} / {pageCount} · 총 {totalCount}명
      </span>
      <div className={styles.workerPaginationActions}>
        <button
          disabled={currentPage <= 1}
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
        >
          이전
        </button>
        <button
          disabled={currentPage >= pageCount}
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
        >
          다음
        </button>
      </div>
    </div>
  );
}

export function WorkersPage({ loginId, onNavigate }: WorkersPageProps) {
  const [profileModalState, setProfileModalState] =
    useState<WorkerProfileModalState | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [workerSearchText, setWorkerSearchText] = useState("");
  const [workerSortKey, setWorkerSortKey] = useState<WorkerSortKey>("name");
  const [workerSortDirection, setWorkerSortDirection] =
    useState<SortDirection>("asc");
  const [workerStatusFilter, setWorkerStatusFilter] =
    useState<WorkerStatusFilter>("all");
  const [workerWorkTypeFilter, setWorkerWorkTypeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusMessage, setStatusMessage] = useState("");
  const workerTableFrameRef = useRef<HTMLDivElement | null>(null);

  const filteredWorkers = useMemo(
    () =>
      workers
        .map((worker, workerIndex) => ({ worker, workerIndex }))
        .filter(({ worker }) => workerMatchesSearch(worker, workerSearchText)),
    [workerSearchText, workers],
  );

  const organizedWorkers = useMemo(
    () =>
      [...filteredWorkers]
        .filter(({ worker }) =>
          workerMatchesStatusFilter(worker, workerStatusFilter),
        )
        .filter(({ worker }) =>
          workerWorkTypeFilter
            ? worker.workTypeCodes.includes(workerWorkTypeFilter)
            : true,
        )
        .sort((leftEntry, rightEntry) =>
          compareWorkers(
            leftEntry.worker,
            rightEntry.worker,
            workerSortKey,
            workerSortDirection,
            workTypes,
          ),
        ),
    [
      filteredWorkers,
      workerSortDirection,
      workerSortKey,
      workerStatusFilter,
      workerWorkTypeFilter,
      workTypes,
    ],
  );

  const pageCount = Math.max(1, Math.ceil(organizedWorkers.length / WORKERS_PER_PAGE));
  const paginatedWorkers = useMemo(
    () =>
      organizedWorkers.slice(
        (currentPage - 1) * WORKERS_PER_PAGE,
        currentPage * WORKERS_PER_PAGE,
      ),
    [currentPage, organizedWorkers],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    workerSearchText,
    workerSortDirection,
    workerSortKey,
    workerStatusFilter,
    workerWorkTypeFilter,
  ]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const moveToPage = (page: number) => {
    setCurrentPage(page);
    window.requestAnimationFrame(() => {
      const tableFrame = workerTableFrameRef.current;

      if (!tableFrame) {
        return;
      }

      tableFrame.scrollTop = 0;
      tableFrame.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchWorkers(loginId), fetchWorkTypes(loginId)])
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

  const addCustomWorkType = async (name: string) => {
    const createdWorkType = await createWorkType(loginId, name);
    setWorkTypes((currentWorkTypes) =>
      currentWorkTypes.some((workType) => workType.code === createdWorkType.code)
        ? currentWorkTypes
        : [...currentWorkTypes, createdWorkType].sort((left, right) =>
            left.name.localeCompare(right.name, "ko-KR"),
          ),
    );
    return createdWorkType;
  };

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
          resultCount={organizedWorkers.length}
          totalCount={workers.length}
          onSearchTextChange={setWorkerSearchText}
        />

        <WorkerListControls
          sortDirection={workerSortDirection}
          sortKey={workerSortKey}
          statusFilter={workerStatusFilter}
          workTypeFilter={workerWorkTypeFilter}
          workTypes={workTypes}
          onSortDirectionChange={setWorkerSortDirection}
          onSortKeyChange={setWorkerSortKey}
          onStatusFilterChange={setWorkerStatusFilter}
          onWorkTypeFilterChange={setWorkerWorkTypeFilter}
        />

        <div className={styles.workerTableFrame} ref={workerTableFrameRef}>
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
              {paginatedWorkers.map(({ worker, workerIndex }) => (
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
        <PaginationControls
          currentPage={currentPage}
          pageCount={pageCount}
          totalCount={organizedWorkers.length}
          onPageChange={moveToPage}
        />
      </section>
      {profileModalState ? (
        <WorkerProfileModal
          loginId={loginId}
          mode={profileModalState.mode}
          workers={workers}
          worker={
            profileModalState.mode === "edit"
              ? profileModalState.worker
              : undefined
          }
          workTypeOptions={workTypes}
          onCreateWorkType={addCustomWorkType}
          onClose={() => setProfileModalState(null)}
          onDeleted={(nextWorkers) => {
            setWorkers(nextWorkers);
            setStatusMessage("작업자를 삭제했습니다.");
          }}
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
