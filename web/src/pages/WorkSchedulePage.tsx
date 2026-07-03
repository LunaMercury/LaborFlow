import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  fetchScheduleTasks,
  updateScheduleTask,
  type ScheduleAssignment,
  type ScheduleTask,
} from "../api/scheduleApi";
import {
  fetchWorkers,
  fetchWorkTypes,
  updateWorkerGender as saveWorkerGender,
  updateWorkerIdentity as saveWorkerIdentity,
  updateWorkerPickupLocation as saveWorkerPickupLocation,
  updateWorkerWorkTypes as saveWorkerWorkTypes,
} from "../api/workforceApi";
import appStyles from "../App.module.css";
import { WorkerWorkTypeCell } from "../components/WorkerWorkTypeCell";
import type { WorkerRow } from "../data/workerRows";
import {
  workTypeOptions as fallbackWorkTypeOptions,
  type WorkTypeOption,
} from "../data/workTypeOptions";
import scheduleStyles from "./WorkSchedulePage.module.css";

const styles = { ...appStyles, ...scheduleStyles };
const TASK_ORDER_STORAGE_PREFIX = "laborflow.workSchedule.taskOrder";

type WorkSchedulePageProps = {
  loginId: string;
};

type AssignmentArea = "men" | "women";

type TaskAssignments = {
  men: string[];
  workerCounts: Record<string, number>;
  women: string[];
};

type EditingAssignmentCount = {
  taskId: string;
  value: string;
  workerId: string;
};

type RequiredWorkerCount = {
  men: number;
  women: number;
};

type EditingRequiredCount = {
  area: AssignmentArea;
  taskId: string;
  value: string;
};

type DraggingWorkerState = {
  label: string;
  workerIds: string[];
};

type DraggingTaskState = {
  address: string;
  height: number;
  offsetX: number;
  offsetY: number;
  ownerName: string;
  requiredMen: number;
  requiredWomen: number;
  taskId: string;
  title: string;
  width: number;
};

type TaskOrderDropPosition = "after" | "before";

type WorkerTeamGroup = {
  displayOrder: number;
  teamName: string;
  teamUuid: string;
  workers: WorkerRow[];
};

type WorkerListEntry =
  | {
      type: "team";
      team: WorkerTeamGroup;
    }
  | {
      type: "worker";
      worker: WorkerRow;
    };

type WorkFilterSuggestion = {
  label: string;
  type: "group" | "workType";
};

type EditingWorkerDraft = {
  gender: string;
  name: string;
  nickname: string;
  pickupLocation: string;
  workerId: string;
};

type TaskDetailDraft = {
  address: string;
  title: string;
  workTypeCodes: string[];
};

type TaskMemoEditorProps = {
  ariaLabel: string;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

type WorkFilterInputProps = {
  onAddFilter: (filterLabel: string) => void;
  selectedFilters: string[];
  workTypes: WorkTypeOption[];
};

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToInputValue(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getTaskOrderStorageKey(loginId: string, selectedDate: string) {
  return `${TASK_ORDER_STORAGE_PREFIX}:${loginId}:${selectedDate}`;
}

function loadCachedTaskOrder(loginId: string, selectedDate: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(
      getTaskOrderStorageKey(loginId, selectedDate),
    );
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    return Array.isArray(parsedValue)
      ? parsedValue.filter((taskId): taskId is string => typeof taskId === "string")
      : [];
  } catch {
    return [];
  }
}

function saveCachedTaskOrder(
  loginId: string,
  selectedDate: string,
  taskIds: string[],
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getTaskOrderStorageKey(loginId, selectedDate),
      JSON.stringify(taskIds),
    );
  } catch {
    // Local cache is a convenience only; failing to persist must not block scheduling.
  }
}

function applyCachedTaskOrder(
  tasks: ScheduleTask[],
  loginId: string,
  selectedDate: string,
) {
  const cachedTaskIds = loadCachedTaskOrder(loginId, selectedDate);

  if (cachedTaskIds.length === 0) {
    return tasks;
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const orderedTasks = cachedTaskIds
    .map((taskId) => taskById.get(taskId))
    .filter((task): task is ScheduleTask => Boolean(task));
  const orderedTaskIds = new Set(orderedTasks.map((task) => task.id));
  const newTasks = tasks.filter((task) => !orderedTaskIds.has(task.id));

  return [...orderedTasks, ...newTasks];
}

function reorderTasks(
  tasks: ScheduleTask[],
  draggedTaskId: string,
  targetTaskId: string,
  position: TaskOrderDropPosition,
) {
  if (draggedTaskId === targetTaskId) {
    return tasks;
  }

  const draggedTask = tasks.find((task) => task.id === draggedTaskId);

  if (!draggedTask) {
    return tasks;
  }

  const remainingTasks = tasks.filter((task) => task.id !== draggedTaskId);
  const targetIndex = remainingTasks.findIndex((task) => task.id === targetTaskId);

  if (targetIndex < 0) {
    return tasks;
  }

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  const nextTasks = [...remainingTasks];
  nextTasks.splice(insertIndex, 0, draggedTask);

  return nextTasks;
}

function getPreviousDateInputValue(value: string) {
  return addDaysToInputValue(value, -1);
}

function getNextDateInputValue(value: string) {
  return addDaysToInputValue(value, 1);
}

function getWeekdayBitFromInputValue(value: string) {
  const dayIndex = new Date(`${value}T00:00:00`).getDay();

  return dayIndex === 0 ? 64 : 1 << (dayIndex - 1);
}

function workerIsAvailableOnDate(worker: WorkerRow, selectedDate: string) {
  if (worker.isActive === false) {
    return false;
  }

  const availableDaysMask = worker.availableDaysMask ?? 127;
  const selectedDayBit = getWeekdayBitFromInputValue(selectedDate);

  return (availableDaysMask & selectedDayBit) !== 0;
}

function getWorkerDisplayName(worker: WorkerRow) {
  const name = worker.name.trim();
  const nickname = worker.nickname?.trim() ?? "";

  return name || nickname || "이름 없음";
}

function getWorkerId(worker: WorkerRow) {
  return (
    worker.profileUuid ?? `${worker.phone}-${getWorkerDisplayName(worker)}`
  );
}

function getWorkerGenderLabel(gender?: string) {
  const normalizedGender = gender?.trim().toUpperCase();

  if (normalizedGender === "MALE" || normalizedGender === "M") {
    return "남";
  }

  if (normalizedGender === "FEMALE" || normalizedGender === "F") {
    return "여";
  }

  return "미정";
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function normalizeScheduleMatchText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function getWorkTypeNames(codes: string[], workTypes: WorkTypeOption[]) {
  return codes
    .map((code) => workTypes.find((workType) => workType.code === code)?.name)
    .filter((name): name is string => Boolean(name));
}

function getWorkTypeGroupName(workTypeName: string) {
  return workTypeName.trim().split(/\s+/)[0] ?? "";
}

function createWorkFilterSuggestions(
  filterDraft: string,
  selectedFilters: string[],
  workTypes: WorkTypeOption[],
) {
  const normalizedDraft = normalizeScheduleMatchText(filterDraft);
  const selectedFilterSet = new Set(selectedFilters.map(normalizeSearchText));
  const groups = new Map<string, WorkFilterSuggestion>();
  const suggestions: WorkFilterSuggestion[] = [];

  for (const workType of workTypes) {
    const groupName = getWorkTypeGroupName(workType.name);
    const groupKey = normalizeSearchText(groupName);
    if (groupName && !groups.has(groupKey)) {
      groups.set(groupKey, {
        label: groupName,
        type: "group",
      });
    }
  }

  for (const group of groups.values()) {
    const normalizedLabel = normalizeSearchText(group.label);
    if (
      !selectedFilterSet.has(normalizedLabel) &&
      (!normalizedDraft ||
        normalizeScheduleMatchText(group.label).includes(normalizedDraft))
    ) {
      suggestions.push(group);
    }
  }

  for (const workType of workTypes) {
    const normalizedLabel = normalizeSearchText(workType.name);
    if (
      !selectedFilterSet.has(normalizedLabel) &&
      (!normalizedDraft ||
        normalizeScheduleMatchText(workType.name).includes(normalizedDraft))
    ) {
      suggestions.push({
        label: workType.name,
        type: "workType",
      });
    }
  }

  return suggestions.slice(0, 10);
}

function workerMatchesFilters(
  worker: WorkerRow,
  workTypes: WorkTypeOption[],
  filters: string[],
) {
  const normalizedFilters = filters
    .map(normalizeScheduleMatchText)
    .filter(Boolean);

  if (normalizedFilters.length === 0) {
    return true;
  }

  return normalizedFilters.some((filterText) =>
    worker.workTypeCodes.some((code) => {
      const workType = workTypes.find((option) => option.code === code);
      return (
        normalizeScheduleMatchText(code).includes(filterText) ||
        normalizeScheduleMatchText(workType?.name ?? "").includes(filterText)
      );
    }),
  );
}

function WorkFilterInput({
  onAddFilter,
  selectedFilters,
  workTypes,
}: WorkFilterInputProps) {
  const [filterDraft, setFilterDraft] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const suggestions = useMemo(
    () => createWorkFilterSuggestions(filterDraft, selectedFilters, workTypes),
    [filterDraft, selectedFilters, workTypes],
  );

  const addFilter = (filterLabel = filterDraft) => {
    const nextFilter = filterLabel.trim();
    if (!nextFilter) {
      return;
    }

    onAddFilter(nextFilter);
    setFilterDraft("");
    setIsDropdownOpen(false);
  };

  return (
    <div
      className={`${styles.scheduleFilterBox} ${styles.scheduleWorkFilterBox}`}
    >
      <input
        aria-label="작업 필터"
        placeholder="작업 필터 검색"
        value={filterDraft}
        onBlur={() => {
          window.setTimeout(() => setIsDropdownOpen(false), 120);
        }}
        onChange={(event) => {
          setFilterDraft(event.target.value);
          setIsDropdownOpen(true);
        }}
        onFocus={() => setIsDropdownOpen(true)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          event.preventDefault();
          addFilter();
        }}
      />
      <button
        aria-label="작업 필터 추가"
        type="button"
        onClick={() => addFilter()}
      >
        +
      </button>
      {isDropdownOpen && suggestions.length > 0 ? (
        <div className={styles.scheduleWorkFilterDropdown}>
          {suggestions.map((suggestion) => (
            <button
              className={styles.scheduleWorkFilterOption}
              key={`${suggestion.type}-${suggestion.label}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addFilter(suggestion.label)}
            >
              <span>{suggestion.label}</span>
              <small>{suggestion.type === "group" ? "상위" : "작업"}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function createAssignmentDrafts(
  tasks: ScheduleTask[],
): Record<string, TaskAssignments> {
  return Object.fromEntries(
    tasks.map((task) => {
      const workerCounts = Object.fromEntries(
        task.assignments.map((assignment) => [
          assignment.workerProfileUuid,
          assignment.workerCount || 1,
        ]),
      );

      return [
        task.id,
        {
          men: task.assignments
            .filter((assignment) => assignment.area === "men")
            .map((assignment) => assignment.workerProfileUuid),
          workerCounts,
          women: task.assignments
            .filter((assignment) => assignment.area === "women")
            .map((assignment) => assignment.workerProfileUuid),
        },
      ];
    }),
  );
}

function createRequiredCountDrafts(
  tasks: ScheduleTask[],
): Record<string, RequiredWorkerCount> {
  return Object.fromEntries(
    tasks.map((task) => [
      task.id,
      {
        men: task.requiredMen,
        women: task.requiredWomen,
      },
    ]),
  );
}

function createMemoDrafts(tasks: ScheduleTask[]): Record<string, string> {
  return Object.fromEntries(tasks.map((task) => [task.id, task.memo]));
}

function createTaskDetailDrafts(
  tasks: ScheduleTask[],
): Record<string, TaskDetailDraft> {
  return Object.fromEntries(
    tasks.map((task) => [
      task.id,
      {
        address: task.address,
        title: task.title,
        workTypeCodes: task.workTypeCodes,
      },
    ]),
  );
}

function toScheduleAssignments(
  taskAssignments: TaskAssignments,
): ScheduleAssignment[] {
  return [
    ...taskAssignments.men.map((workerProfileUuid) => ({
      area: "men" as const,
      workerProfileUuid,
      workerCount: taskAssignments.workerCounts[workerProfileUuid] ?? 1,
    })),
    ...taskAssignments.women.map((workerProfileUuid) => ({
      area: "women" as const,
      workerProfileUuid,
      workerCount: taskAssignments.workerCounts[workerProfileUuid] ?? 1,
    })),
  ];
}

function createEmptyTaskAssignments(): TaskAssignments {
  return {
    men: [],
    workerCounts: {},
    women: [],
  };
}

function sumWorkerCounts(workerIds: string[], taskAssignments: TaskAssignments) {
  return workerIds.reduce(
    (totalCount, workerId) =>
      totalCount + (taskAssignments.workerCounts[workerId] ?? 1),
    0,
  );
}

function serializeTaskAssignments(taskAssignments: TaskAssignments) {
  return [...taskAssignments.men, ...taskAssignments.women]
    .map((workerId) => {
      const area = taskAssignments.men.includes(workerId) ? "men" : "women";
      return `${area}:${workerId}:${taskAssignments.workerCounts[workerId] ?? 1}`;
    })
    .sort()
    .join("|");
}

function TaskMemoEditor({
  ariaLabel,
  initialValue,
  onCancel,
  onConfirm,
}: TaskMemoEditorProps) {
  const [draft, setDraft] = useState(initialValue);

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  return (
    <>
      <textarea
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className={styles.scheduleMemoActions}>
        <button
          aria-label="메모 저장"
          className={styles.inlineConfirmButton}
          type="button"
          onClick={() => onConfirm(draft)}
        >
          ✓
        </button>
        <button
          aria-label="메모 취소"
          className={styles.inlineCancelButton}
          type="button"
          onClick={onCancel}
        >
          ×
        </button>
      </div>
    </>
  );
}

export function WorkSchedulePage({ loginId }: WorkSchedulePageProps) {
  const [selectedDate, setSelectedDate] = useState(getTodayInputValue);
  const [workerSearchDraft, setWorkerSearchDraft] = useState("");
  const [workFilters, setWorkFilters] = useState<string[]>([]);
  const [isTeamViewEnabled, setIsTeamViewEnabled] = useState(false);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [persistedTasks, setPersistedTasks] = useState<ScheduleTask[]>([]);
  const [assignedWorkerIdsByTaskId, setAssignedWorkerIdsByTaskId] = useState<
    Record<string, TaskAssignments>
  >({});
  const [requiredCountsByTaskId, setRequiredCountsByTaskId] = useState<
    Record<string, RequiredWorkerCount>
  >({});
  const [memoByTaskId, setMemoByTaskId] = useState<Record<string, string>>({});
  const [taskDetailDraftsByTaskId, setTaskDetailDraftsByTaskId] = useState<
    Record<string, TaskDetailDraft>
  >({});
  const [draggingWorker, setDraggingWorker] =
    useState<DraggingWorkerState | null>(null);
  const [editingRequiredCount, setEditingRequiredCount] =
    useState<EditingRequiredCount | null>(null);
  const [editingAssignmentCount, setEditingAssignmentCount] =
    useState<EditingAssignmentCount | null>(null);
  const [editingTaskMemoId, setEditingTaskMemoId] = useState<string | null>(
    null,
  );
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [loadingPreviousAssignmentsTaskId, setLoadingPreviousAssignmentsTaskId] =
    useState<string | null>(null);
  const [editingWorkerDraft, setEditingWorkerDraft] =
    useState<EditingWorkerDraft | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draggingTask, setDraggingTask] = useState<DraggingTaskState | null>(
    null,
  );
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragPointRef = useRef({ x: 0, y: 0 });
  const taskDragPreviewRef = useRef<HTMLDivElement | null>(null);
  const taskDragFrameRef = useRef<number | null>(null);
  const taskDragPointRef = useRef({ x: 0, y: 0 });
  const taskOrderDropTargetRef = useRef<{
    position: TaskOrderDropPosition;
    targetTaskId: string;
  } | null>(null);
  const taskOrderDropTargetElementRef = useRef<HTMLElement | null>(null);
  const tasksRef = useRef<ScheduleTask[]>([]);
  const draggingWorkerIds = useMemo(
    () => new Set(draggingWorker?.workerIds ?? []),
    [draggingWorker],
  );
  const isDraggingWorkers = draggingWorkerIds.size > 0;

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetchWorkers(loginId),
      fetchWorkTypes(),
      fetchScheduleTasks(loginId, selectedDate),
    ])
      .then(([nextWorkers, nextWorkTypes, nextTasks]) => {
        if (!isMounted) {
          return;
        }

        const orderedTasks = applyCachedTaskOrder(nextTasks, loginId, selectedDate);

        setWorkers(nextWorkers);
        setWorkTypes(nextWorkTypes);
        setTasks(orderedTasks);
        setPersistedTasks(orderedTasks);
        setAssignedWorkerIdsByTaskId(createAssignmentDrafts(orderedTasks));
        setRequiredCountsByTaskId(createRequiredCountDrafts(orderedTasks));
        setMemoByTaskId(createMemoDrafts(orderedTasks));
        setTaskDetailDraftsByTaskId(createTaskDetailDrafts(orderedTasks));
        setEditingRequiredCount(null);
        setEditingTaskMemoId(null);
        setEditingTaskId(null);
        setCollapsedTaskIds(new Set());
        setStatusMessage("");
      })
      .catch(() => {
        if (isMounted) {
          setWorkers([]);
          setTasks([]);
          setPersistedTasks([]);
          setAssignedWorkerIdsByTaskId({});
          setRequiredCountsByTaskId({});
          setMemoByTaskId({});
          setTaskDetailDraftsByTaskId({});
          setStatusMessage("작업 일정 데이터를 불러오지 못했습니다.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loginId, selectedDate]);

  const assignedWorkerIds = useMemo(
    () =>
      new Set(
        Object.values(assignedWorkerIdsByTaskId).flatMap((assignment) => [
          ...assignment.men,
          ...assignment.women,
        ]),
      ),
    [assignedWorkerIdsByTaskId],
  );

  const workerGroups = useMemo(() => {
    const matchingWorkers: WorkerRow[] = [];
    const otherWorkers: WorkerRow[] = [];
    const normalizedWorkerSearch = normalizeSearchText(workerSearchDraft);
    const availableWorkers = workers.filter((worker) => {
      if (assignedWorkerIds.has(getWorkerId(worker))) {
        return false;
      }

      if (!workerIsAvailableOnDate(worker, selectedDate)) {
        return false;
      }

      if (!normalizedWorkerSearch) {
        return true;
      }

      return [
        worker.name,
        worker.nickname ?? "",
        getWorkerDisplayName(worker),
      ].some((name) =>
        normalizeSearchText(name).includes(normalizedWorkerSearch),
      );
    });

    for (const worker of availableWorkers) {
      if (workerMatchesFilters(worker, workTypes, workFilters)) {
        matchingWorkers.push(worker);
      } else {
        otherWorkers.push(worker);
      }
    }

    return { matchingWorkers, otherWorkers };
  }, [assignedWorkerIds, selectedDate, workFilters, workTypes, workerSearchDraft, workers]);

  const addWorkFilter = (filterLabel: string) => {
    const nextFilter = filterLabel.trim();
    if (!nextFilter) {
      return;
    }

    setWorkFilters((currentFilters) =>
      currentFilters.some(
        (currentFilter) =>
          normalizeSearchText(currentFilter) ===
          normalizeSearchText(nextFilter),
      )
        ? currentFilters
        : [...currentFilters, nextFilter],
    );
  };

  const removeWorkFilter = (filter: string) => {
    setWorkFilters((currentFilters) =>
      currentFilters.filter((currentFilter) => currentFilter !== filter),
    );
  };

  const toggleTaskCollapse = (taskId: string) => {
    setCollapsedTaskIds((currentTaskIds) => {
      const nextTaskIds = new Set(currentTaskIds);

      if (nextTaskIds.has(taskId)) {
        nextTaskIds.delete(taskId);
      } else {
        nextTaskIds.add(taskId);
      }

      return nextTaskIds;
    });
  };

  const clearTaskOrderDropIndicator = () => {
    const currentElement = taskOrderDropTargetElementRef.current;

    if (currentElement) {
      currentElement.classList.remove(
        styles.scheduleTaskDropAfter,
        styles.scheduleTaskDropBefore,
      );
    }

    taskOrderDropTargetElementRef.current = null;
  };

  const updateTaskOrderDropTarget = (
    targetCard: HTMLElement,
    targetTaskId: string,
    position: TaskOrderDropPosition,
  ) => {
    const currentTarget = taskOrderDropTargetRef.current;

    if (
      currentTarget?.targetTaskId === targetTaskId &&
      currentTarget.position === position &&
      taskOrderDropTargetElementRef.current === targetCard
    ) {
      return;
    }

    clearTaskOrderDropIndicator();
    taskOrderDropTargetRef.current = { position, targetTaskId };
    taskOrderDropTargetElementRef.current = targetCard;
    targetCard.classList.add(
      position === "before"
        ? styles.scheduleTaskDropBefore
        : styles.scheduleTaskDropAfter,
    );
  };

  const moveTaskOrderPreview = (
    clientX: number,
    clientY: number,
    nextDraggingTask = draggingTask,
  ) => {
    taskDragPointRef.current = { x: clientX, y: clientY };

    if (taskDragFrameRef.current !== null) {
      return;
    }

    taskDragFrameRef.current = window.requestAnimationFrame(() => {
      taskDragFrameRef.current = null;
      const previewElement = taskDragPreviewRef.current;

      if (!previewElement) {
        return;
      }

      const currentDraggingTask = nextDraggingTask ?? draggingTask;
      const offsetX = currentDraggingTask?.offsetX ?? 14;
      const offsetY = currentDraggingTask?.offsetY ?? 14;

      previewElement.style.transform = `translate3d(${taskDragPointRef.current.x - offsetX}px, ${
        taskDragPointRef.current.y - offsetY
      }px, 0)`;
    });
  };

  const moveDraggingTask = (clientX: number, clientY: number) => {
    if (!draggingTask) {
      return;
    }

    moveTaskOrderPreview(clientX, clientY);

    const targetElement = document.elementFromPoint(clientX, clientY);
    const targetCard = targetElement?.closest<HTMLElement>("[data-schedule-task-id]");
    const targetTaskId = targetCard?.dataset.scheduleTaskId;

    if (!targetCard || !targetTaskId || targetTaskId === draggingTask.taskId) {
      taskOrderDropTargetRef.current = null;
      clearTaskOrderDropIndicator();
      return;
    }

    const targetRect = targetCard.getBoundingClientRect();
    const position: TaskOrderDropPosition =
      clientY < targetRect.top + targetRect.height / 2 ? "before" : "after";

    updateTaskOrderDropTarget(targetCard, targetTaskId, position);
  };

  const startTaskOrderDrag = (
    task: ScheduleTask,
    taskDetailDraft: TaskDetailDraft,
    requiredCounts: RequiredWorkerCount,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const sourceCard = event.currentTarget.closest<HTMLElement>(
      "[data-schedule-task-id]",
    );
    const sourceRect = sourceCard?.getBoundingClientRect();
    const nextDraggingTask: DraggingTaskState = {
      address: taskDetailDraft.address || task.address,
      height: sourceRect?.height ?? 180,
      offsetX: sourceRect ? event.clientX - sourceRect.left : 14,
      offsetY: sourceRect ? event.clientY - sourceRect.top : 14,
      ownerName: task.ownerName,
      requiredMen: requiredCounts.men,
      requiredWomen: requiredCounts.women,
      taskId: task.id,
      title: taskDetailDraft.title || task.title || "작업 미입력",
      width: sourceRect?.width ?? 320,
    };

    moveTaskOrderPreview(event.clientX, event.clientY, nextDraggingTask);
    setDraggingTask(nextDraggingTask);
    setStatusMessage("작업 순서를 조정하는 중입니다.");
  };

  useEffect(() => {
    if (!draggingTask) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      moveDraggingTask(event.clientX, event.clientY);
    };

    const finishTaskOrderDrag = () => {
      const dropTarget = taskOrderDropTargetRef.current;
      const nextTasks = dropTarget
        ? reorderTasks(
            tasksRef.current,
            draggingTask.taskId,
            dropTarget.targetTaskId,
            dropTarget.position,
          )
        : tasksRef.current;

      tasksRef.current = nextTasks;
      setTasks(nextTasks);
      saveCachedTaskOrder(
        loginId,
        selectedDate,
        nextTasks.map((task) => task.id),
      );
      taskOrderDropTargetRef.current = null;
      clearTaskOrderDropIndicator();
      setDraggingTask(null);
      setStatusMessage("작업 순서를 이 브라우저에 저장했습니다.");
    };

    document.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    document.addEventListener("pointerup", finishTaskOrderDrag, { once: true });
    document.addEventListener("pointercancel", finishTaskOrderDrag, { once: true });

    return () => {
      if (taskDragFrameRef.current !== null) {
        window.cancelAnimationFrame(taskDragFrameRef.current);
        taskDragFrameRef.current = null;
      }

      taskOrderDropTargetRef.current = null;
      clearTaskOrderDropIndicator();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", finishTaskOrderDrag);
      document.removeEventListener("pointercancel", finishTaskOrderDrag);
    };
  }, [draggingTask, loginId, selectedDate]);

  const getRequiredCounts = (task: ScheduleTask) =>
    requiredCountsByTaskId[task.id] ?? {
      men: task.requiredMen,
      women: task.requiredWomen,
    };

  const getTaskDetailDraft = (task: ScheduleTask) =>
    taskDetailDraftsByTaskId[task.id] ?? {
      address: task.address,
      title: task.title,
      workTypeCodes: task.workTypeCodes,
    };

  const hasTaskDraftChanges = (task: ScheduleTask) => {
    const persistedTask =
      persistedTasks.find((currentTask) => currentTask.id === task.id) ?? task;
    const assignments =
      assignedWorkerIdsByTaskId[task.id] ?? createEmptyTaskAssignments();
    const persistedAssignments = createAssignmentDrafts([persistedTask])[
      persistedTask.id
    ] ?? createEmptyTaskAssignments();
    const requiredCounts = getRequiredCounts(task);
    const detailDraft = getTaskDetailDraft(task);

    return (
      serializeTaskAssignments(assignments) !==
        serializeTaskAssignments(persistedAssignments) ||
      requiredCounts.men !== persistedTask.requiredMen ||
      requiredCounts.women !== persistedTask.requiredWomen ||
      (memoByTaskId[task.id] ?? task.memo) !== persistedTask.memo ||
      detailDraft.title !== persistedTask.title ||
      detailDraft.address !== persistedTask.address ||
      detailDraft.workTypeCodes.join("|") !==
        persistedTask.workTypeCodes.join("|")
    );
  };

  const updateRequiredCount = (
    task: ScheduleTask,
    targetArea: AssignmentArea,
    nextValue: string,
  ) => {
    const normalizedValue = Math.max(0, Number(nextValue) || 0);

    setRequiredCountsByTaskId((currentCounts) => {
      const currentTaskCounts = currentCounts[task.id] ?? {
        men: task.requiredMen,
        women: task.requiredWomen,
      };

      return {
        ...currentCounts,
        [task.id]: {
          ...currentTaskCounts,
          [targetArea]: normalizedValue,
        },
      };
    });
  };

  const startRequiredCountEdit = (
    task: ScheduleTask,
    targetArea: AssignmentArea,
    currentValue: number,
  ) => {
    setEditingRequiredCount({
      area: targetArea,
      taskId: task.id,
      value: String(currentValue),
    });
  };

  const confirmRequiredCountEdit = (task: ScheduleTask) => {
    if (!editingRequiredCount || editingRequiredCount.taskId !== task.id) {
      return;
    }

    updateRequiredCount(
      task,
      editingRequiredCount.area,
      editingRequiredCount.value,
    );
    setEditingRequiredCount(null);
  };

  const startTaskMemoEdit = (task: ScheduleTask) => {
    setEditingTaskMemoId(task.id);
  };

  const confirmTaskMemoEdit = (value: string) => {
    if (!editingTaskMemoId) {
      return;
    }

    setMemoByTaskId((currentMemos) => ({
      ...currentMemos,
      [editingTaskMemoId]: value.trim(),
    }));
    setEditingTaskMemoId(null);
  };

  const applyTaskDraft = async (task: ScheduleTask) => {
    const taskAssignments =
      assignedWorkerIdsByTaskId[task.id] ?? createEmptyTaskAssignments();
    const requiredCounts = getRequiredCounts(task);
    const detailDraft = getTaskDetailDraft(task);

    setSavingTaskId(task.id);
    setStatusMessage("");

    try {
      const savedTask = await updateScheduleTask(
        loginId,
        selectedDate,
        task.id,
        {
          address: detailDraft.address,
          assignments: toScheduleAssignments(taskAssignments),
          memo: memoByTaskId[task.id] ?? task.memo,
          requiredMen: requiredCounts.men,
          requiredWomen: requiredCounts.women,
          title: detailDraft.title,
          workTypeCodes: detailDraft.workTypeCodes,
        },
      );

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === savedTask.id ? savedTask : currentTask,
        ),
      );
      setPersistedTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === savedTask.id ? savedTask : currentTask,
        ),
      );
      setAssignedWorkerIdsByTaskId((currentAssignments) => ({
        ...currentAssignments,
        [savedTask.id]: createAssignmentDrafts([savedTask])[savedTask.id],
      }));
      setRequiredCountsByTaskId((currentCounts) => ({
        ...currentCounts,
        [savedTask.id]: createRequiredCountDrafts([savedTask])[savedTask.id],
      }));
      setMemoByTaskId((currentMemos) => ({
        ...currentMemos,
        [savedTask.id]: savedTask.memo,
      }));
      setTaskDetailDraftsByTaskId((currentDrafts) => ({
        ...currentDrafts,
        [savedTask.id]: createTaskDetailDrafts([savedTask])[savedTask.id],
      }));
      setEditingTaskId((currentTaskId) =>
        currentTaskId === savedTask.id ? null : currentTaskId,
      );
      setStatusMessage("작업 일정이 저장되었습니다.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "작업 일정을 저장하지 못했습니다.",
      );
    } finally {
      setSavingTaskId(null);
    }
  };

  const resetTaskDraft = (taskId: string) => {
    const persistedTask = persistedTasks.find((task) => task.id === taskId);
    if (!persistedTask) {
      return;
    }

    setAssignedWorkerIdsByTaskId((currentAssignments) => ({
      ...currentAssignments,
      [taskId]: createAssignmentDrafts([persistedTask])[taskId],
    }));
    setRequiredCountsByTaskId((currentCounts) => ({
      ...currentCounts,
      [taskId]: createRequiredCountDrafts([persistedTask])[taskId],
    }));
    setMemoByTaskId((currentMemos) => ({
      ...currentMemos,
      [taskId]: persistedTask.memo,
    }));
    setTaskDetailDraftsByTaskId((currentDrafts) => ({
      ...currentDrafts,
      [taskId]: createTaskDetailDrafts([persistedTask])[taskId],
    }));
    setEditingRequiredCount(null);
    setEditingTaskMemoId((currentTaskId) =>
      currentTaskId === taskId ? null : currentTaskId,
    );
    setEditingTaskId((currentTaskId) =>
      currentTaskId === taskId ? null : currentTaskId,
    );
    setStatusMessage("마지막 저장 상태로 되돌렸습니다.");
  };

  const importPreviousDayAssignments = async (task: ScheduleTask) => {
    const previousDate = getPreviousDateInputValue(selectedDate);
    setLoadingPreviousAssignmentsTaskId(task.id);
    setStatusMessage("");

    try {
      const previousTasks = await fetchScheduleTasks(loginId, previousDate);
      const currentTitle = normalizeScheduleMatchText(
        getTaskDetailDraft(task).title,
      );
      const currentOwnerName = normalizeScheduleMatchText(task.ownerName);
      const previousTaskByWorkSite = previousTasks.find(
        (currentTask) => currentTask.workSiteId === task.workSiteId,
      );
      const previousTaskByOwnerAndTitle = previousTasks
        .filter(
          (currentTask) =>
            normalizeScheduleMatchText(currentTask.ownerName) ===
              currentOwnerName &&
            normalizeScheduleMatchText(currentTask.title) === currentTitle,
        )
        .sort((leftTask, rightTask) => {
          return rightTask.assignments.length - leftTask.assignments.length;
        })[0];
      const previousTask = previousTaskByWorkSite ?? previousTaskByOwnerAndTitle;

      if (!previousTask) {
        setStatusMessage("전일 동일 작업의 배정이 없습니다.");
        return;
      }

      const assignedToOtherTasks = new Set(
        Object.entries(assignedWorkerIdsByTaskId)
          .filter(([taskId]) => taskId !== task.id)
          .flatMap(([, assignments]) => [
            ...assignments.men,
            ...assignments.women,
          ]),
      );
      const nextAssignments: TaskAssignments = {
        men: previousTask.assignments
          .filter((assignment) => assignment.area === "men")
          .map((assignment) => assignment.workerProfileUuid)
          .filter((workerId) => !assignedToOtherTasks.has(workerId)),
        workerCounts: Object.fromEntries(
          previousTask.assignments
            .filter(
              (assignment) =>
                !assignedToOtherTasks.has(assignment.workerProfileUuid),
            )
            .map((assignment) => [
              assignment.workerProfileUuid,
              assignment.workerCount || 1,
            ]),
        ),
        women: previousTask.assignments
          .filter((assignment) => assignment.area === "women")
          .map((assignment) => assignment.workerProfileUuid)
          .filter((workerId) => !assignedToOtherTasks.has(workerId)),
      };
      const previousAssignmentCount = previousTask.assignments.length;
      const importedAssignmentCount =
        nextAssignments.men.length + nextAssignments.women.length;

      if (previousAssignmentCount === 0) {
        setStatusMessage("전일 작업자 배정이 비어 있습니다.");
        return;
      }

      setAssignedWorkerIdsByTaskId((currentAssignments) => ({
        ...currentAssignments,
        [task.id]: nextAssignments,
      }));
      setStatusMessage(
        previousAssignmentCount === importedAssignmentCount
          ? "전일 작업자를 불러왔습니다. 체크 버튼을 눌러야 저장됩니다."
          : "전일 작업자 중 이미 다른 작업에 배정된 인원은 제외했습니다. 체크 버튼을 눌러야 저장됩니다.",
      );
    } catch {
      setStatusMessage("전일 작업자를 불러오지 못했습니다.");
    } finally {
      setLoadingPreviousAssignmentsTaskId(null);
    }
  };

  const openWorkerEditor = (worker: WorkerRow) => {
    setEditingWorkerDraft({
      gender: worker.gender ?? "UNKNOWN",
      name: worker.name,
      nickname: worker.nickname ?? "",
      pickupLocation: worker.pickupLocation,
      workerId: getWorkerId(worker),
    });
  };

  const closeWorkerEditor = () => {
    setEditingWorkerDraft(null);
  };

  const saveWorkerEditor = async () => {
    if (!editingWorkerDraft) {
      return;
    }

    const worker = workers.find(
      (currentWorker) =>
        getWorkerId(currentWorker) === editingWorkerDraft.workerId,
    );
    if (!worker) {
      closeWorkerEditor();
      return;
    }

    if (
      !editingWorkerDraft.name.trim() &&
      !editingWorkerDraft.nickname.trim()
    ) {
      window.alert("이름 또는 호칭 중 하나를 입력해주세요.");
      return;
    }

    if (!worker.profileUuid) {
      setWorkers((currentWorkers) =>
        currentWorkers.map((currentWorker) =>
          getWorkerId(currentWorker) === editingWorkerDraft.workerId
            ? {
                ...currentWorker,
                gender: editingWorkerDraft.gender,
                name: editingWorkerDraft.name,
                nickname: editingWorkerDraft.nickname,
                pickupLocation: editingWorkerDraft.pickupLocation,
              }
            : currentWorker,
        ),
      );
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      closeWorkerEditor();
      return;
    }

    setSavingWorkerId(editingWorkerDraft.workerId);
    setStatusMessage("");

    try {
      let savedWorkers = workers;

      if (
        worker.name !== editingWorkerDraft.name ||
        (worker.nickname ?? "") !== editingWorkerDraft.nickname
      ) {
        savedWorkers = await saveWorkerIdentity(
          loginId,
          worker.profileUuid,
          editingWorkerDraft.name,
          editingWorkerDraft.nickname,
        );
      }

      if (worker.pickupLocation !== editingWorkerDraft.pickupLocation) {
        savedWorkers = await saveWorkerPickupLocation(
          loginId,
          worker.profileUuid,
          editingWorkerDraft.pickupLocation,
        );
      }

      if ((worker.gender ?? "UNKNOWN") !== editingWorkerDraft.gender) {
        savedWorkers = await saveWorkerGender(
          loginId,
          worker.profileUuid,
          editingWorkerDraft.gender,
        );
      }

      setWorkers(savedWorkers);
      setStatusMessage("작업자 정보를 DB에 저장했습니다.");
      closeWorkerEditor();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "작업자 정보를 저장하지 못했습니다.",
      );
    } finally {
      setSavingWorkerId(null);
    }
  };

  const updateWorkerWorkTypes = async (
    worker: WorkerRow,
    nextWorkTypeCodes: string[],
    nextWorkTypeRatings: Record<string, number>,
  ) => {
    const workerId = getWorkerId(worker);
    const previousWorkers = workers;

    setWorkers((currentWorkers) =>
      currentWorkers.map((currentWorker) =>
        getWorkerId(currentWorker) === workerId
          ? {
              ...currentWorker,
              workTypeCodes: nextWorkTypeCodes,
              workTypeRatings: nextWorkTypeRatings,
            }
          : currentWorker,
      ),
    );

    if (!worker.profileUuid) {
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      setWorkers(
        await saveWorkerWorkTypes(
          loginId,
          worker.profileUuid,
          nextWorkTypeCodes,
          nextWorkTypeRatings,
        ),
      );
      setStatusMessage("가능한 작업을 DB에 저장했습니다.");
    } catch {
      setWorkers(previousWorkers);
      setStatusMessage("가능한 작업 저장에 실패했습니다.");
    }
  };

  const handleWorkerDrop = (
    taskId: string,
    targetArea: AssignmentArea,
    workerIds: string[],
  ) => {
    const workerIdSet = new Set(workerIds);

    setAssignedWorkerIdsByTaskId((currentAssignments) => {
      const movedWorkerCounts = Object.fromEntries(
        workerIds.map((workerId) => [
          workerId,
          Object.values(currentAssignments).find(
            (assignment) => assignment.workerCounts[workerId] !== undefined,
          )?.workerCounts[workerId] ?? 1,
        ]),
      );
      const nextAssignments = Object.fromEntries(
        Object.entries(currentAssignments).map(
          ([currentTaskId, assignment]) => [
            currentTaskId,
            {
              men: assignment.men.filter(
                (assignedWorkerId) => !workerIdSet.has(assignedWorkerId),
              ),
              workerCounts: Object.fromEntries(
                Object.entries(assignment.workerCounts).filter(
                  ([assignedWorkerId]) => !workerIdSet.has(assignedWorkerId),
                ),
              ),
              women: assignment.women.filter(
                (assignedWorkerId) => !workerIdSet.has(assignedWorkerId),
              ),
            },
          ],
        ),
      );
      const taskAssignments =
        nextAssignments[taskId] ?? createEmptyTaskAssignments();
      const targetWorkerIds = taskAssignments[targetArea];

      return {
        ...nextAssignments,
        [taskId]: {
          ...taskAssignments,
          workerCounts: {
            ...taskAssignments.workerCounts,
            ...movedWorkerCounts,
          },
          [targetArea]: [
            ...targetWorkerIds,
            ...workerIds.filter(
              (workerId) => !targetWorkerIds.includes(workerId),
            ),
          ],
        },
      };
    });
  };

  const removeAssignedWorker = (taskId: string, workerId: string) => {
    setAssignedWorkerIdsByTaskId((currentAssignments) => ({
      ...currentAssignments,
      [taskId]: {
        men: (currentAssignments[taskId]?.men ?? []).filter(
          (assignedWorkerId) => assignedWorkerId !== workerId,
        ),
        workerCounts: Object.fromEntries(
          Object.entries(currentAssignments[taskId]?.workerCounts ?? {}).filter(
            ([assignedWorkerId]) => assignedWorkerId !== workerId,
          ),
        ),
        women: (currentAssignments[taskId]?.women ?? []).filter(
          (assignedWorkerId) => assignedWorkerId !== workerId,
        ),
      },
    }));
  };

  const releaseAssignedWorkers = (workerIds: string[]) => {
    const workerIdSet = new Set(workerIds);

    setAssignedWorkerIdsByTaskId((currentAssignments) =>
      Object.fromEntries(
        Object.entries(currentAssignments).map(([taskId, assignment]) => [
          taskId,
          {
            men: assignment.men.filter(
              (assignedWorkerId) => !workerIdSet.has(assignedWorkerId),
            ),
            workerCounts: Object.fromEntries(
              Object.entries(assignment.workerCounts).filter(
                ([assignedWorkerId]) => !workerIdSet.has(assignedWorkerId),
              ),
            ),
            women: assignment.women.filter(
              (assignedWorkerId) => !workerIdSet.has(assignedWorkerId),
            ),
          },
        ]),
      ),
    );
  };

  const startAssignmentCountEdit = (
    taskId: string,
    workerId: string,
    currentValue: number,
  ) => {
    setEditingAssignmentCount({
      taskId,
      value: String(currentValue),
      workerId,
    });
  };

  const confirmAssignmentCountEdit = () => {
    if (!editingAssignmentCount) {
      return;
    }

    const nextWorkerCount = Number.parseInt(editingAssignmentCount.value, 10);
    if (!Number.isFinite(nextWorkerCount) || nextWorkerCount < 1) {
      setEditingAssignmentCount(null);
      return;
    }

    setAssignedWorkerIdsByTaskId((currentAssignments) => {
      const taskAssignments =
        currentAssignments[editingAssignmentCount.taskId] ??
        createEmptyTaskAssignments();

      return {
        ...currentAssignments,
        [editingAssignmentCount.taskId]: {
          ...taskAssignments,
          workerCounts: {
            ...taskAssignments.workerCounts,
            [editingAssignmentCount.workerId]: Math.min(nextWorkerCount, 100),
          },
        },
      };
    });
    setEditingAssignmentCount(null);
  };

  const getWorkersByIds = (workerIds: string[]) =>
    workerIds
      .map((workerId) =>
        workers.find((worker) => getWorkerId(worker) === workerId),
      )
      .filter((worker): worker is WorkerRow => Boolean(worker));

  const moveDragPreview = (clientX: number, clientY: number) => {
    dragPointRef.current = { x: clientX, y: clientY };

    if (dragFrameRef.current !== null) {
      return;
    }

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const previewElement = dragPreviewRef.current;

      if (!previewElement) {
        return;
      }

      previewElement.style.transform = `translate3d(${dragPointRef.current.x + 12}px, ${
        dragPointRef.current.y + 12
      }px, 0)`;
    });
  };

  useEffect(() => {
    if (!draggingWorker) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      moveDragPreview(event.clientX, event.clientY);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const targetElement = document.elementFromPoint(
        event.clientX,
        event.clientY,
      );

      if (targetElement instanceof Element) {
        const dropZone = targetElement.closest<HTMLElement>(
          "[data-schedule-drop-task-id][data-schedule-drop-area]",
        );

        if (
          dropZone?.dataset.scheduleDropTaskId &&
          dropZone.dataset.scheduleDropArea
        ) {
          handleWorkerDrop(
            dropZone.dataset.scheduleDropTaskId,
            dropZone.dataset.scheduleDropArea as AssignmentArea,
            draggingWorker.workerIds,
          );
        } else if (targetElement.closest("[data-worker-return-zone='true']")) {
          releaseAssignedWorkers(draggingWorker.workerIds);
        }
      }

      setDraggingWorker(null);
    };

    document.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }

      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [draggingWorker]);

  const startWorkerDrag = (
    workerId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    moveDragPreview(event.clientX, event.clientY);
    const worker = workers.find(
      (currentWorker) => getWorkerId(currentWorker) === workerId,
    );
    setDraggingWorker({
      label: worker ? getWorkerDisplayName(worker) : "작업자",
      workerIds: [workerId],
    });
  };

  const startTeamDrag = (
    team: WorkerTeamGroup,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    moveDragPreview(event.clientX, event.clientY);
    setDraggingWorker({
      label: team.teamName,
      workerIds: team.workers.map(getWorkerId),
    });
  };

  const createWorkerListEntries = (groupWorkers: WorkerRow[]): WorkerListEntry[] => {
    if (!isTeamViewEnabled) {
      return groupWorkers.map((worker) => ({ type: "worker", worker }));
    }

    const teamGroupsByUuid = new Map<string, WorkerTeamGroup>();
    const entries: WorkerListEntry[] = [];

    for (const worker of groupWorkers) {
      if (!worker.teamUuid || !worker.teamName) {
        entries.push({ type: "worker", worker });
        continue;
      }

      const existingTeam = teamGroupsByUuid.get(worker.teamUuid);
      if (existingTeam) {
        existingTeam.workers.push(worker);
      } else {
        teamGroupsByUuid.set(worker.teamUuid, {
          displayOrder: worker.teamDisplayOrder ?? 0,
          teamName: worker.teamName,
          teamUuid: worker.teamUuid,
          workers: [worker],
        });
      }
    }

    for (const team of teamGroupsByUuid.values()) {
      team.workers.sort(
        (leftWorker, rightWorker) =>
          (leftWorker.teamDisplayOrder ?? 0) -
            (rightWorker.teamDisplayOrder ?? 0) ||
          getWorkerDisplayName(leftWorker).localeCompare(
            getWorkerDisplayName(rightWorker),
            "ko-KR",
          ),
      );
      entries.push({ type: "team", team });
    }

    return entries.sort((leftEntry, rightEntry) => {
      const leftLabel =
        leftEntry.type === "team"
          ? leftEntry.team.teamName
          : getWorkerDisplayName(leftEntry.worker);
      const rightLabel =
        rightEntry.type === "team"
          ? rightEntry.team.teamName
          : getWorkerDisplayName(rightEntry.worker);

      return leftLabel.localeCompare(rightLabel, "ko-KR");
    });
  };

  const renderWorkerToken = (
    worker: WorkerRow,
    variant: "list" | "assigned",
    assignmentAction?: React.ReactNode,
  ) => {
    const workerId = getWorkerId(worker);
    const workerWorkTypeNames = getWorkTypeNames(
      worker.workTypeCodes,
      workTypes,
    );
    const trimmedName = worker.name.trim();
    const trimmedNickname = worker.nickname?.trim() ?? "";
    const identityText =
      trimmedName && trimmedNickname
        ? `${trimmedName} - ${trimmedNickname}`
        : trimmedName || trimmedNickname || "이름 없음";
    const firstLineWorkTypes = workerWorkTypeNames.slice(0, 3);
    const secondLineWorkTypes = workerWorkTypeNames.slice(3, 6);
    const genderLabel = getWorkerGenderLabel(worker.gender);
    const genderClassName =
      genderLabel === "남"
        ? styles.scheduleWorkerGenderMale
        : genderLabel === "여"
          ? styles.scheduleWorkerGenderFemale
          : styles.scheduleWorkerGenderUnknown;
    const isEditingWorker = editingWorkerDraft?.workerId === workerId;
    const isSavingWorker = savingWorkerId === workerId;
    const pickupLocationClassName = worker.pickupLocation
      ? styles.scheduleWorkerMeta
      : `${styles.scheduleWorkerMeta} ${styles.emptyPickupLocation}`;

    return (
      <div
        className={`${styles.scheduleWorkerToken} ${
          draggingWorkerIds.has(workerId) ? styles.draggingWorkerToken : ""
        } ${variant === "assigned" ? styles.droppedWorkerToken : ""}`}
        draggable={false}
        key={workerId}
        role="button"
        tabIndex={0}
        onPointerDown={(event) => startWorkerDrag(workerId, event)}
      >
        {variant === "assigned" ? (
          <div className={styles.assignedWorkerTokenContent}>
            <div className={styles.assignedWorkerTokenIdentity}>
              <span className={styles.scheduleWorkerName}>{identityText}</span>
              <span className={pickupLocationClassName}>
                {worker.pickupLocation || "승차장소 없음"}
              </span>
            </div>
            <div className={styles.assignedWorkerTokenCount}>
              {assignmentAction}
            </div>
          </div>
        ) : (
          <>
            <span className={styles.scheduleWorkerTokenLine}>
              <span className={styles.scheduleWorkerName}>{identityText}</span>
              <span className={styles.scheduleWorkerWorkTypes}>
                {firstLineWorkTypes.length > 0
                  ? firstLineWorkTypes.join(", ")
                  : "가능한 작업 없음"}
              </span>
              <span
                className={`${styles.scheduleWorkerGender} ${genderClassName}`}
              >
                {genderLabel}
              </span>
            </span>
            <span className={styles.scheduleWorkerTokenLine}>
              <span className={pickupLocationClassName}>
                {worker.pickupLocation || "승차장소 없음"}
              </span>
              <span className={styles.scheduleWorkerWorkTypes}>
                {secondLineWorkTypes.join(", ")}
              </span>
              <button
                aria-label={`${getWorkerDisplayName(worker)} 수정`}
                className={styles.scheduleWorkerInlineEditButton}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openWorkerEditor(worker);
                }}
                onPointerDown={(event) => event.stopPropagation()}
              >
                수정
              </button>
            </span>
            {isEditingWorker ? (
              <div
                className={styles.scheduleWorkerQuickEditor}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className={styles.scheduleWorkerQuickFields}>
                  <label>
                    <span>이름</span>
                    <input
                      value={editingWorkerDraft.name}
                      onChange={(event) =>
                        setEditingWorkerDraft({
                          ...editingWorkerDraft,
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>호칭</span>
                    <input
                      value={editingWorkerDraft.nickname}
                      onChange={(event) =>
                        setEditingWorkerDraft({
                          ...editingWorkerDraft,
                          nickname: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>승차장소</span>
                    <input
                      value={editingWorkerDraft.pickupLocation}
                      onChange={(event) =>
                        setEditingWorkerDraft({
                          ...editingWorkerDraft,
                          pickupLocation: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <div className={styles.scheduleWorkerGenderEditor}>
                  <span>성별</span>
                  <div>
                    {[
                      { label: "남", value: "MALE" },
                      { label: "여", value: "FEMALE" },
                      { label: "미정", value: "UNKNOWN" },
                    ].map((option) => (
                      <button
                        className={
                          editingWorkerDraft.gender === option.value
                            ? styles.scheduleWorkerGenderOptionActive
                            : styles.scheduleWorkerGenderOption
                        }
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setEditingWorkerDraft({
                            ...editingWorkerDraft,
                            gender: option.value,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.scheduleWorkerQuickWorkTypes}>
                  <span>가능한 작업</span>
                  <WorkerWorkTypeCell
                    selectedCodes={worker.workTypeCodes}
                    selectedRatings={worker.workTypeRatings}
                    workTypeOptions={workTypes}
                    onChange={(nextWorkTypeCodes, nextWorkTypeRatings) =>
                      updateWorkerWorkTypes(
                        worker,
                        nextWorkTypeCodes,
                        nextWorkTypeRatings,
                      )
                    }
                  />
                </div>
                <div className={styles.scheduleWorkerQuickActions}>
                  <button
                    className={styles.inlineConfirmButton}
                    disabled={isSavingWorker}
                    type="button"
                    onClick={saveWorkerEditor}
                  >
                    ✓
                  </button>
                  <button
                    className={styles.inlineCancelButton}
                    disabled={isSavingWorker}
                    type="button"
                    onClick={closeWorkerEditor}
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  };

  const renderTeamCard = (team: WorkerTeamGroup) => (
    <div
      className={`${styles.scheduleWorkerTeamCard} ${
        team.workers.some((worker) => draggingWorkerIds.has(getWorkerId(worker)))
          ? styles.draggingWorkerTeamCard
          : ""
      }`}
      key={team.teamUuid}
      role="button"
      tabIndex={0}
      onPointerDown={(event) => startTeamDrag(team, event)}
    >
      <div className={styles.scheduleWorkerTeamTitle}>
        {team.teamName} - {team.workers.length}명
      </div>
      <div className={styles.scheduleWorkerTeamMembers}>
        {team.workers.map((worker) => renderWorkerToken(worker, "list"))}
      </div>
    </div>
  );

  const renderWorkerListEntry = (entry: WorkerListEntry) =>
    entry.type === "team"
      ? renderTeamCard(entry.team)
      : renderWorkerToken(entry.worker, "list");

  const draggingWorkerRows = draggingWorker
    ? getWorkersByIds(draggingWorker.workerIds)
    : [];
  const draggingWorkerRow = draggingWorkerRows[0];

  return (
    <main className={styles.mainContent}>
      <section className={styles.workSchedulePanel} aria-label="작업 일정">
        <div className={styles.scheduleDateBar}>
          {statusMessage ? (
            <p className={styles.scheduleStatusMessage}>{statusMessage}</p>
          ) : null}
          <label className={styles.scheduleDateField}>
            <span>작업일</span>
            <div className={styles.scheduleDateControl}>
              <button
                className={styles.scheduleDateMoveButton}
                type="button"
                onClick={() =>
                  setSelectedDate(getPreviousDateInputValue(selectedDate))
                }
              >
                ◀ 어제
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
              <button
                className={styles.scheduleDateMoveButton}
                type="button"
                onClick={() =>
                  setSelectedDate(getNextDateInputValue(selectedDate))
                }
              >
                내일 ▶
              </button>
            </div>
          </label>
        </div>

        <div className={styles.workScheduleSplit}>
          <section
            className={`${styles.scheduleColumn} ${
              isDraggingWorkers ? styles.activeWorkerReturnZone : ""
            }`}
            aria-label="작업자 목록"
            data-worker-return-zone="true"
          >
            <div className={styles.scheduleColumnHeader}>
              <div className={styles.scheduleWorkerHeaderContent}>
                <p className={styles.sectionLabel}>작업자 목록</p>
                <div
                  className={`${styles.scheduleFilterBox} ${styles.scheduleNameSearchBox}`}
                >
                  <input
                    aria-label="작업자 이름 검색"
                    placeholder="작업자 이름 검색"
                    value={workerSearchDraft}
                    onChange={(event) =>
                      setWorkerSearchDraft(event.target.value)
                    }
                  />
                </div>
              </div>
              <span className={styles.scheduleCountBadge}>
                {workers.length}명
              </span>
            </div>

            <div className={styles.scheduleWorkerFilterPanel}>
              <WorkFilterInput
                onAddFilter={addWorkFilter}
                selectedFilters={workFilters}
                workTypes={workTypes}
              />
              {workFilters.length > 0 ? (
                <div className={styles.scheduleFilterChipList}>
                  {workFilters.map((filter) => (
                    <button
                      className={styles.scheduleFilterChip}
                      key={filter}
                      type="button"
                      onClick={() => removeWorkFilter(filter)}
                    >
                      {filter} -
                    </button>
                  ))}
                </div>
              ) : null}
              <label className={styles.scheduleTeamToggle}>
                <input
                  checked={isTeamViewEnabled}
                  type="checkbox"
                  onChange={(event) =>
                    setIsTeamViewEnabled(event.target.checked)
                  }
                />
                <span>팀 적용</span>
              </label>
            </div>

            <div className={styles.scheduleWorkerList}>

              <div className={styles.scheduleWorkerGroup}>
                <div className={styles.scheduleGroupTitle}>
                  <strong>
                    {workFilters.length > 0
                      ? "필터에 맞는 작업자"
                      : "전체 작업자"}
                  </strong>
                  <span>{workerGroups.matchingWorkers.length}명</span>
                </div>
                {workerGroups.matchingWorkers.length > 0 ? (
                  createWorkerListEntries(workerGroups.matchingWorkers).map(
                    renderWorkerListEntry,
                  )
                ) : (
                  <p className={styles.scheduleEmptyText}>
                    조건에 맞는 작업자가 없습니다.
                  </p>
                )}
              </div>

              {workFilters.length > 0 ? (
                <div className={styles.scheduleWorkerGroup}>
                  <div className={styles.scheduleGroupDivider} />
                  <div className={styles.scheduleGroupTitle}>
                    <strong>그 외 작업자</strong>
                    <span>{workerGroups.otherWorkers.length}명</span>
                  </div>
                  {workerGroups.otherWorkers.length > 0 ? (
                    createWorkerListEntries(workerGroups.otherWorkers).map(
                      renderWorkerListEntry,
                    )
                  ) : (
                    <p className={styles.scheduleEmptyText}>
                      추가로 표시할 작업자가 없습니다.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <section className={styles.scheduleColumn} aria-label="작업 목록">
            <div className={styles.scheduleColumnHeader}>
              <div>
                <p className={styles.sectionLabel}>작업 목록</p>
                <h2>{selectedDate} 작업</h2>
              </div>
              <span className={styles.scheduleCountBadge}>
                {tasks.length}건
              </span>
            </div>

            <div className={styles.scheduleTaskList}>
              {tasks.length === 0 ? (
                <p className={styles.scheduleEmptyText}>
                  선택한 날짜에 등록된 작업이 없습니다.
                </p>
              ) : null}
              {tasks.map((task) => {
                const taskAssignments =
                  assignedWorkerIdsByTaskId[task.id] ??
                  createEmptyTaskAssignments();
                const assignedMenWorkers = getWorkersByIds(taskAssignments.men);
                const assignedWomenWorkers = getWorkersByIds(
                  taskAssignments.women,
                );
                const assignedMenCount = sumWorkerCounts(
                  taskAssignments.men,
                  taskAssignments,
                );
                const assignedWomenCount = sumWorkerCounts(
                  taskAssignments.women,
                  taskAssignments,
                );
                const requiredCounts = getRequiredCounts(task);
                const taskMemo = memoByTaskId[task.id] ?? task.memo;
                const taskDetailDraft = getTaskDetailDraft(task);
                const taskWorkTypeNames = getWorkTypeNames(
                  taskDetailDraft.workTypeCodes,
                  workTypes,
                );
                const isEditingTask = editingTaskId === task.id;
                const isTaskCollapsed = collapsedTaskIds.has(task.id);
                const canApplyTask = hasTaskDraftChanges(task);
                const cancelTaskEdit = () => {
                  const persistedTask =
                    persistedTasks.find(
                      (currentTask) => currentTask.id === task.id,
                    ) ?? task;

                  setTaskDetailDraftsByTaskId((currentDrafts) => ({
                    ...currentDrafts,
                    [task.id]: createTaskDetailDrafts([persistedTask])[task.id],
                  }));
                  setEditingTaskId(null);
                };

                const renderRequiredCount = (
                  area: AssignmentArea,
                  label: string,
                  assignedCount: number,
                  requiredCount: number,
                ) => {
                  const isEditing =
                    editingRequiredCount?.taskId === task.id &&
                    editingRequiredCount.area === area;

                  if (isEditing) {
                    return (
                      <div className={styles.scheduleRequiredCountEditor}>
                        <span>
                          {label} {assignedCount}/
                        </span>
                        <input
                          aria-label={`${task.title} ${label} 필요 인원`}
                          min="0"
                          type="number"
                          value={editingRequiredCount.value}
                          onChange={(event) =>
                            setEditingRequiredCount({
                              ...editingRequiredCount,
                              value: event.target.value,
                            })
                          }
                        />
                        <button
                          aria-label={`${label} 필요 인원 저장`}
                          className={styles.inlineConfirmButton}
                          type="button"
                          onClick={() => confirmRequiredCountEdit(task)}
                        >
                          ✓
                        </button>
                        <button
                          aria-label={`${label} 필요 인원 취소`}
                          className={styles.inlineCancelButton}
                          type="button"
                          onClick={() => setEditingRequiredCount(null)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  }

                  return (
                    <button
                      className={styles.scheduleRequiredCountButton}
                      type="button"
                      onClick={() =>
                        startRequiredCountEdit(task, area, requiredCount)
                      }
                    >
                      {label} {assignedCount}/{requiredCount}
                    </button>
                  );
                };

                const renderDropArea = (
                  targetArea: AssignmentArea,
                  label: string,
                  assignedWorkers: WorkerRow[],
                ) => (
                  <div
                    className={`${styles.scheduleDropZone} ${
                      isDraggingWorkers ? styles.activeScheduleDropZone : ""
                    }`}
                    data-schedule-drop-area={targetArea}
                    data-schedule-drop-task-id={task.id}
                  >
                    <div className={styles.scheduleDropZoneTitle}>{label}</div>
                    {assignedWorkers.length > 0 ? (
                      assignedWorkers.map((worker) => {
                        const workerId = getWorkerId(worker);
                        const assignmentAction =
                          editingAssignmentCount?.taskId === task.id &&
                          editingAssignmentCount.workerId === workerId ? (
                            <div
                              className={styles.assignmentCountEditor}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <input
                                aria-label={`${getWorkerDisplayName(worker)} 배정 인원`}
                                max="100"
                                min="1"
                                type="number"
                                value={editingAssignmentCount.value}
                                onChange={(event) =>
                                  setEditingAssignmentCount({
                                    ...editingAssignmentCount,
                                    value: event.target.value,
                                  })
                                }
                              />
                              <button
                                className={styles.inlineConfirmButton}
                                type="button"
                                onClick={confirmAssignmentCountEdit}
                              >
                                ✓
                              </button>
                              <button
                                className={styles.inlineCancelButton}
                                type="button"
                                onClick={() => setEditingAssignmentCount(null)}
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            <button
                              className={styles.assignmentCountButton}
                              type="button"
                              onClick={() =>
                                startAssignmentCountEdit(
                                  task.id,
                                  workerId,
                                  taskAssignments.workerCounts[workerId] ?? 1,
                                )
                              }
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              인원 {taskAssignments.workerCounts[workerId] ?? 1}
                            </button>
                          );

                        return (
                          <div
                            className={styles.assignedWorkerRow}
                            key={workerId}
                          >
                            {renderWorkerToken(
                              worker,
                              "assigned",
                              assignmentAction,
                            )}
                            <button
                              aria-label={`${getWorkerDisplayName(worker)} 배정 해제`}
                              className={styles.removeAssignedWorkerButton}
                              type="button"
                              onClick={() =>
                                removeAssignedWorker(task.id, workerId)
                              }
                            >
                              ×
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className={styles.scheduleDropHint}>
                        이 영역으로 드래그
                      </p>
                    )}
                  </div>
                );

                return (
                  <div
                    className={`${styles.scheduleTaskCard} ${
                      draggingTask?.taskId === task.id ? styles.draggingScheduleTaskCard : ""
                    }`}
                    data-schedule-task-id={task.id}
                    key={task.id}
                  >
                    <div className={styles.scheduleTaskHeader}>
                      <button
                        aria-label={`${taskDetailDraft.title || task.title} 작업 순서 이동`}
                        className={styles.scheduleTaskOrderHandle}
                        type="button"
                        onPointerDown={(event) =>
                          startTaskOrderDrag(task, taskDetailDraft, requiredCounts, event)
                        }
                      >
                        <span
                          aria-hidden="true"
                          className={styles.scheduleTaskOrderIcon}
                        >
                          <span />
                          <span />
                          <span />
                        </span>
                      </button>
                      <div className={styles.scheduleTaskHeaderContent}>
                        {isEditingTask ? (
                          <div className={styles.scheduleTaskInlineEditor}>
                            <label>
                              <span>작업 내용</span>
                              <input
                                value={taskDetailDraft.title}
                                onChange={(event) =>
                                  setTaskDetailDraftsByTaskId(
                                    (currentDrafts) => ({
                                      ...currentDrafts,
                                      [task.id]: {
                                        ...taskDetailDraft,
                                        title: event.target.value,
                                      },
                                    }),
                                  )
                                }
                              />
                            </label>
                            <label>
                              <span>농장 주소</span>
                              <input
                                value={taskDetailDraft.address}
                                onChange={(event) =>
                                  setTaskDetailDraftsByTaskId(
                                    (currentDrafts) => ({
                                      ...currentDrafts,
                                      [task.id]: {
                                        ...taskDetailDraft,
                                        address: event.target.value,
                                      },
                                    }),
                                  )
                                }
                              />
                            </label>
                          </div>
                        ) : (
                          <>
                            <h3>
                              {taskDetailDraft.title}{" "}
                              <span>/ {task.ownerName}</span>
                            </h3>
                            <p>
                              {task.siteName} · {taskDetailDraft.address}
                            </p>
                          </>
                        )}
                        {task.timeRange ? (
                          <span className={styles.scheduleTaskTime}>
                            {task.timeRange}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.scheduleTaskActions}>
                        {isTaskCollapsed ? (
                          <button
                            aria-label={`${task.title} 작업 펼치기`}
                            className={styles.scheduleTaskCollapseButton}
                            type="button"
                            onClick={() => toggleTaskCollapse(task.id)}
                          >
                            +
                          </button>
                        ) : (
                          <>
                            <button
                              aria-label={`${task.title} 전일 작업자 불러오기`}
                              className={styles.schedulePreviousAssignmentsButton}
                              disabled={
                                loadingPreviousAssignmentsTaskId === task.id
                              }
                              type="button"
                              onClick={() => importPreviousDayAssignments(task)}
                            >
                              전일 작업자
                            </button>
                            <button
                              aria-label={`${task.title} 일정 저장`}
                              className={styles.scheduleTaskApplyButton}
                              disabled={
                                savingTaskId === task.id || !canApplyTask
                              }
                              type="button"
                              onClick={() => applyTaskDraft(task)}
                            >
                              ✓
                            </button>
                            <button
                              aria-label={`${task.title} 일정 되돌리기`}
                              className={styles.scheduleTaskResetButton}
                              disabled={savingTaskId === task.id}
                              type="button"
                              onClick={() => resetTaskDraft(task.id)}
                            >
                              ↻
                            </button>
                            {isEditingTask ? (
                              <div className={styles.scheduleTaskEditActions}>
                                <button
                                  aria-label={`${task.title} 작업 수정 취소`}
                                  className={styles.inlineCancelButton}
                                  type="button"
                                  onClick={cancelTaskEdit}
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button
                                aria-label={`${task.title} 작업 수정`}
                                className={styles.scheduleTaskEditButton}
                                type="button"
                                onClick={() => setEditingTaskId(task.id)}
                              >
                                ✎
                              </button>
                            )}
                            <button
                              aria-label={`${task.title} 작업 접기`}
                              className={styles.scheduleTaskCollapseButton}
                              type="button"
                              onClick={() => toggleTaskCollapse(task.id)}
                            >
                              -
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={styles.scheduleTaskMeta}>
                      {renderRequiredCount(
                        "men",
                        "남",
                        assignedMenCount,
                        requiredCounts.men,
                      )}
                      {renderRequiredCount(
                        "women",
                        "여",
                        assignedWomenCount,
                        requiredCounts.women,
                      )}
                      {isEditingTask ? (
                        <div className={styles.scheduleTaskWorkTypeEditor}>
                          <WorkerWorkTypeCell
                            selectedCodes={taskDetailDraft.workTypeCodes}
                            selectedRatings={{}}
                            workTypeOptions={workTypes}
                            onChange={(nextWorkTypeCodes) =>
                              setTaskDetailDraftsByTaskId((currentDrafts) => ({
                                ...currentDrafts,
                                [task.id]: {
                                  ...taskDetailDraft,
                                  workTypeCodes: nextWorkTypeCodes,
                                },
                              }))
                            }
                          />
                        </div>
                      ) : (
                        <span>{taskWorkTypeNames.join(", ")}</span>
                      )}
                    </div>

                    <div
                      className={`${styles.scheduleDropZoneGrid} ${
                        isTaskCollapsed
                          ? styles.collapsedScheduleDropZoneGrid
                          : styles.expandedScheduleDropZoneGrid
                      }`}
                    >
                      {renderDropArea("men", "남자 작업자", assignedMenWorkers)}
                      {renderDropArea(
                        "women",
                        "여자 작업자",
                        assignedWomenWorkers,
                      )}
                    </div>

                    <div className={styles.scheduleTaskMemo}>
                      {editingTaskMemoId === task.id ? (
                        <TaskMemoEditor
                          ariaLabel={`${task.title} 메모`}
                          initialValue={taskMemo}
                          onCancel={() => setEditingTaskMemoId(null)}
                          onConfirm={confirmTaskMemoEdit}
                        />
                      ) : (
                        <>
                          <span>{taskMemo || "메모 없음"}</span>
                          <button
                            aria-label={`${task.title} 메모 수정`}
                            className={styles.scheduleMemoEditButton}
                            type="button"
                            onClick={() => startTaskMemoEdit(task)}
                          >
                            ✎
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        {draggingWorker && draggingWorkerRows.length > 0 ? (
          <div
            className={styles.scheduleDragPreview}
            ref={dragPreviewRef}
            style={{
              transform: `translate3d(${dragPointRef.current.x + 12}px, ${
                dragPointRef.current.y + 12
              }px, 0)`,
            }}
          >
            <span className={styles.scheduleWorkerName}>
              {draggingWorker.label}
            </span>
            <span className={styles.scheduleWorkerMeta}>
              {draggingWorkerRow.pickupLocation || "승차장소 없음"}
            </span>
          </div>
        ) : null}
        {draggingTask ? (
          <div
            className={styles.scheduleTaskDragPreview}
            ref={taskDragPreviewRef}
            style={{
              height: draggingTask.height,
              transform: `translate3d(${taskDragPointRef.current.x - draggingTask.offsetX}px, ${
                taskDragPointRef.current.y - draggingTask.offsetY
              }px, 0)`,
              width: draggingTask.width,
            }}
          >
            <strong>
              {draggingTask.title} <span>/ {draggingTask.ownerName}</span>
            </strong>
            <p>{draggingTask.address || "작업 장소 미입력"}</p>
            <small>
              남 {draggingTask.requiredMen} / 여 {draggingTask.requiredWomen}
            </small>
          </div>
        ) : null}
      </section>
    </main>
  );
}
