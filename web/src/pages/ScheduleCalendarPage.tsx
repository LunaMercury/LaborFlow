import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createScheduleTask,
  deleteScheduleTaskRange,
  fetchFarmOwners,
  fetchScheduleTasks,
  rescheduleScheduleRange,
  updateScheduleTask,
  type FarmOwnerOption,
  type ScheduleTask,
} from "../api/scheduleApi";
import { fetchWorkTypes } from "../api/workforceApi";
import appStyles from "../App.module.css";
import { workTypeOptions as fallbackWorkTypeOptions } from "../data/workTypeOptions";
import calendarStyles from "./ScheduleCalendarPage.module.css";

const styles = { ...appStyles, ...calendarStyles };
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const RESIZE_SNAP_THRESHOLD = 0.3;
const OWNER_SEARCH_DEBOUNCE_MS = 300;

type ScheduleCalendarPageProps = {
  loginId: string;
};

type DatedScheduleTask = ScheduleTask & {
  date: string;
};

type CalendarEvent = {
  assignments: ScheduleTask["assignments"];
  address: string;
  assignmentsCount: number;
  endDate: string;
  endTime: string;
  id: string;
  memo: string;
  ownerName: string;
  ownerUuid: string;
  requiredMen: number;
  requiredWomen: number;
  siteName: string;
  sourceDates: string[];
  startDate: string;
  startTime: string;
  taskIds: string[];
  timeRange: string;
  title: string;
  workSiteId: string;
  workTypeCodes: string[];
};

type CalendarEventSegment = {
  endColumn: number;
  endDate: string;
  event: CalendarEvent;
  isEnd: boolean;
  isStart: boolean;
  lane: number;
  startColumn: number;
  startDate: string;
};

type CalendarOwnerGroup = {
  endColumn: number;
  id: string;
  laneCount: number;
  ownerName: string;
  segments: CalendarEventSegment[];
  startColumn: number;
};

type CalendarOwnerLane = {
  groups: CalendarOwnerGroup[];
  id: string;
  laneCount: number;
};

type CalendarWeek = {
  dates: string[];
  id: string;
  ownerLanes: CalendarOwnerLane[];
};

type CalendarAgendaDay = {
  date: string;
  events: CalendarEvent[];
  id: string;
};

type CalendarDragState = {
  eventId: string;
  mode: "move" | "resize-end" | "resize-start";
};

type CalendarViewMode = "agenda" | "calendar";

type CalendarDragPreview = {
  clientX: number;
  clientY: number;
  eventId: string;
  height: number;
  mode: CalendarDragState["mode"];
  offsetX: number;
  offsetY: number;
  width: number;
  x: number;
  y: number;
};

type ScheduleCreateDraft = {
  address: string;
  endDate: string;
  endTime: string;
  memo: string;
  ownerName: string;
  ownerQuery: string;
  ownerUuid: string;
  requiredMen: string;
  requiredWomen: string;
  siteName: string;
  startDate: string;
  startTime: string;
  title: string;
  workTypeCodes: string[];
};

type ScheduleEditDraft = {
  address: string;
  endDate: string;
  memo: string;
  ownerName: string;
  ownerQuery: string;
  ownerUuid: string;
  requiredMen: string;
  requiredWomen: string;
  startDate: string;
  title: string;
  workTypeCodes: string[];
};

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createEmptyScheduleDraft(date: string): ScheduleCreateDraft {
  return {
    address: "",
    endDate: date,
    endTime: "17:00",
    memo: "",
    ownerName: "",
    ownerQuery: "",
    ownerUuid: "",
    requiredMen: "0",
    requiredWomen: "0",
    siteName: "",
    startDate: date,
    startTime: "07:00",
    title: "",
    workTypeCodes: [],
  };
}

function createEditScheduleDraft(event: CalendarEvent): ScheduleEditDraft {
  return {
    address: event.address,
    endDate: event.endDate,
    memo: event.memo,
    ownerName: event.ownerName,
    ownerQuery: event.ownerName,
    ownerUuid: event.ownerUuid,
    requiredMen: String(event.requiredMen),
    requiredWomen: String(event.requiredWomen),
    startDate: event.startDate,
    title: event.title,
    workTypeCodes: event.workTypeCodes,
  };
}

type FarmOwnerSearchFieldProps = {
  initialQuery: string;
  label: string;
  loginId: string;
  onInvalidate: () => void;
  onSelect: (farmOwner: FarmOwnerOption) => void;
  selectedOwnerUuid: string;
};

function FarmOwnerSearchField({
  initialQuery,
  label,
  loginId,
  onInvalidate,
  onSelect,
  selectedOwnerUuid,
}: FarmOwnerSearchFieldProps) {
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<FarmOwnerOption[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!isDropdownOpen) {
      return;
    }

    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      fetchFarmOwners(loginId, query)
        .then((nextOptions) => {
          if (isMounted) {
            setOptions(nextOptions);
          }
        })
        .catch(() => {
          if (isMounted) {
            setOptions([]);
          }
        });
    }, OWNER_SEARCH_DEBOUNCE_MS);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [isDropdownOpen, loginId, query]);

  const selectOwner = (farmOwner: FarmOwnerOption) => {
    setQuery(farmOwner.displayName);
    setIsDropdownOpen(false);
    onSelect(farmOwner);
  };

  return (
    <label className={styles.scheduleCreateOwnerField}>
      <span>{label}</span>
      <input
        autoComplete="off"
        placeholder="농장주명을 입력하세요"
        type="text"
        value={query}
        onBlur={() => window.setTimeout(() => setIsDropdownOpen(false), 120)}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          setIsDropdownOpen(true);

          if (selectedOwnerUuid) {
            onInvalidate();
          }
        }}
        onFocus={() => setIsDropdownOpen(true)}
      />
      {isDropdownOpen ? (
        <div className={styles.scheduleOwnerDropdown}>
          {options.length > 0 ? (
            options.map((farmOwner) => (
              <button
                key={farmOwner.uuid}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOwner(farmOwner)}
              >
                <strong>{farmOwner.displayName}</strong>
                {farmOwner.businessName ? (
                  <span>{farmOwner.businessName}</span>
                ) : null}
              </button>
            ))
          ) : (
            <div className={styles.scheduleOwnerEmpty}>
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      ) : null}
    </label>
  );
}

function parseInputDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function addDays(value: string, days: number) {
  const date = parseInputDate(value);
  date.setDate(date.getDate() + days);

  return toInputDate(date);
}

function diffDays(leftDate: string, rightDate: string) {
  const leftTime = parseInputDate(leftDate).getTime();
  const rightTime = parseInputDate(rightDate).getTime();

  return Math.round((leftTime - rightTime) / 86_400_000);
}

function getMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isValidMonthInputValue(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function getMonthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-");

  return `${year}년 ${Number(month)}월`;
}

function createVisibleDates(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDate = new Date(year, month - 1, 1);
  const startDate = new Date(firstDate);
  startDate.setDate(firstDate.getDate() - firstDate.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return toInputDate(date);
  });
}

function createEventGroupKey(task: DatedScheduleTask) {
  return [
    task.workSiteId,
    task.ownerName,
    task.title,
    task.address,
    task.startTime,
    task.endTime,
  ].join("|");
}

function taskToEvent(task: DatedScheduleTask): CalendarEvent {
  return {
    assignments: task.assignments,
    address: task.address,
    assignmentsCount: task.assignments.reduce(
      (total, assignment) => total + (assignment.workerCount || 1),
      0,
    ),
    endDate: task.date,
    endTime: task.endTime,
    id: `${task.workSiteId}-${task.id}`,
    memo: task.memo,
    ownerName: task.ownerName,
    ownerUuid: task.ownerUuid,
    requiredMen: task.requiredMen,
    requiredWomen: task.requiredWomen,
    siteName: task.siteName,
    sourceDates: [task.date],
    startDate: task.date,
    startTime: task.startTime,
    taskIds: [task.id],
    timeRange: task.timeRange,
    title: task.title,
    workSiteId: task.workSiteId,
    workTypeCodes: task.workTypeCodes,
  };
}

function groupTasksIntoEvents(tasks: DatedScheduleTask[]) {
  const tasksByGroupKey = new Map<string, DatedScheduleTask[]>();

  for (const task of tasks) {
    const groupKey = createEventGroupKey(task);
    tasksByGroupKey.set(groupKey, [
      ...(tasksByGroupKey.get(groupKey) ?? []),
      task,
    ]);
  }

  const events: CalendarEvent[] = [];

  for (const groupedTasks of tasksByGroupKey.values()) {
    const sortedTasks = [...groupedTasks].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    let currentEvent: CalendarEvent | null = null;

    for (const task of sortedTasks) {
      if (!currentEvent) {
        currentEvent = taskToEvent(task);
        continue;
      }

      if (task.date === addDays(currentEvent.endDate, 1)) {
        currentEvent.endDate = task.date;
        currentEvent.sourceDates.push(task.date);
        currentEvent.taskIds.push(task.id);
        currentEvent.assignmentsCount += task.assignments.reduce(
          (total, assignment) => total + (assignment.workerCount || 1),
          0,
        );
      } else {
        events.push(currentEvent);
        currentEvent = taskToEvent(task);
      }
    }

    if (currentEvent) {
      events.push(currentEvent);
    }
  }

  return events.sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.ownerName.localeCompare(right.ownerName, "ko-KR") ||
      left.title.localeCompare(right.title, "ko-KR"),
  );
}

function chunkVisibleDates(visibleDates: string[]) {
  return Array.from(
    { length: Math.ceil(visibleDates.length / 7) },
    (_, index) => visibleDates.slice(index * 7, index * 7 + 7),
  );
}

function createEventSegment(
  event: CalendarEvent,
  weekDates: string[],
): CalendarEventSegment | null {
  const weekStartDate = weekDates[0];
  const weekEndDate = weekDates[weekDates.length - 1];

  if (event.endDate < weekStartDate || event.startDate > weekEndDate) {
    return null;
  }

  const startDate =
    event.startDate > weekStartDate ? event.startDate : weekStartDate;
  const endDate = event.endDate < weekEndDate ? event.endDate : weekEndDate;
  const startIndex = weekDates.indexOf(startDate);
  const endIndex = weekDates.indexOf(endDate);

  if (startIndex < 0 || endIndex < 0) {
    return null;
  }

  return {
    endColumn: endIndex + 2,
    endDate,
    event,
    isEnd: event.endDate === endDate,
    isStart: event.startDate === startDate,
    lane: 0,
    startColumn: startIndex + 1,
    startDate,
  };
}

function assignSegmentLanes(segments: CalendarEventSegment[]) {
  const laneEndColumns: number[] = [];

  return [...segments]
    .sort(
      (left, right) =>
        left.startColumn - right.startColumn ||
        left.endColumn - right.endColumn ||
        left.event.title.localeCompare(right.event.title, "ko-KR"),
    )
    .map((segment) => {
      const lane = laneEndColumns.findIndex(
        (endColumn) => segment.startColumn >= endColumn,
      );
      const nextLane = lane >= 0 ? lane : laneEndColumns.length;
      laneEndColumns[nextLane] = segment.endColumn;

      return { ...segment, lane: nextLane };
    });
}

function assignOwnerLanes(
  ownerGroups: CalendarOwnerGroup[],
  weekIndex: number,
) {
  const ownerLanes: CalendarOwnerLane[] = [];
  const laneEndColumns: number[] = [];

  for (const ownerGroup of ownerGroups) {
    const laneIndex = laneEndColumns.findIndex(
      (endColumn) => ownerGroup.startColumn >= endColumn,
    );
    const nextLaneIndex = laneIndex >= 0 ? laneIndex : ownerLanes.length;
    const previousLane = ownerLanes[nextLaneIndex];
    const nextGroups = [...(previousLane?.groups ?? []), ownerGroup];

    laneEndColumns[nextLaneIndex] = ownerGroup.endColumn;
    ownerLanes[nextLaneIndex] = {
      groups: nextGroups,
      id: `${weekIndex}-owner-lane-${nextLaneIndex}`,
      laneCount: Math.max(...nextGroups.map((group) => group.laneCount)),
    };
  }

  return ownerLanes;
}

function createCalendarWeeks(
  events: CalendarEvent[],
  visibleDates: string[],
): CalendarWeek[] {
  return chunkVisibleDates(visibleDates).map((weekDates, weekIndex) => {
    const ownerSegments = new Map<
      string,
      { ownerName: string; segments: CalendarEventSegment[] }
    >();

    for (const event of events) {
      const segment = createEventSegment(event, weekDates);

      if (!segment) {
        continue;
      }

      const ownerName = event.ownerName || "농장주 미입력";
      const ownerKey = ownerName.trim() || "농장주 미입력";
      const ownerGroup = ownerSegments.get(ownerKey) ?? {
        ownerName,
        segments: [],
      };

      ownerGroup.segments.push(segment);
      ownerSegments.set(ownerKey, ownerGroup);
    }

    const ownerGroups = [...ownerSegments.entries()]
      .map(([ownerKey, ownerGroup]) => {
        const segments = assignSegmentLanes(ownerGroup.segments);

        return {
          endColumn: Math.max(...segments.map((segment) => segment.endColumn)),
          id: `${weekIndex}-${ownerKey}`,
          laneCount: Math.max(...segments.map((segment) => segment.lane)) + 1,
          ownerName: ownerGroup.ownerName,
          segments,
          startColumn: Math.min(
            ...segments.map((segment) => segment.startColumn),
          ),
        };
      })
      .sort(
        (left, right) =>
          left.startColumn - right.startColumn ||
          left.ownerName.localeCompare(right.ownerName, "ko-KR"),
      );

    return {
      dates: weekDates,
      id: weekDates[0],
      ownerLanes: assignOwnerLanes(ownerGroups, weekIndex),
    };
  });
}

function isCurrentMonth(date: string, monthValue: string) {
  return date.startsWith(monthValue);
}

function getDateDayLabel(date: string) {
  return String(parseInputDate(date).getDate());
}

function getAgendaDateLabel(date: string) {
  const parsedDate = parseInputDate(date);
  const dayName = DAY_NAMES[parsedDate.getDay()];

  return `${parsedDate.getMonth() + 1}월 ${parsedDate.getDate()}일 ${dayName}`;
}

function getDefaultCalendarViewMode(): CalendarViewMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 720px)").matches
  ) {
    return "agenda";
  }

  return "calendar";
}

function createAgendaDays(
  events: CalendarEvent[],
  visibleDates: string[],
  monthValue: string,
) {
  return visibleDates
    .filter((date) => isCurrentMonth(date, monthValue))
    .map<CalendarAgendaDay>((date) => ({
      date,
      events: events
        .filter((event) => event.startDate <= date && event.endDate >= date)
        .sort(
          (left, right) =>
            left.ownerName.localeCompare(right.ownerName, "ko-KR") ||
            left.title.localeCompare(right.title, "ko-KR"),
        ),
      id: date,
    }));
}

function getResizeAnchorIndex(
  event: CalendarEvent,
  mode: CalendarDragState["mode"],
  weekDates: string[],
) {
  const anchorDate = mode === "resize-start" ? event.startDate : event.endDate;
  const anchorIndex = weekDates.indexOf(anchorDate);

  if (anchorIndex >= 0) {
    return anchorIndex;
  }

  return anchorDate < weekDates[0] ? 0 : 6;
}

function getPointerColumnIndex(
  clientX: number,
  rect: DOMRect,
  mode: CalendarDragState["mode"],
  anchorIndex?: number,
) {
  const columnWidth = rect.width / 7;
  const rawColumn = Math.min(
    6.999,
    Math.max(0, (clientX - rect.left) / columnWidth),
  );

  if (mode === "move" || anchorIndex === undefined) {
    return Math.min(6, Math.max(0, Math.floor(rawColumn)));
  }

  const adjustedColumn =
    rawColumn > anchorIndex
      ? Math.max(anchorIndex, rawColumn - RESIZE_SNAP_THRESHOLD)
      : rawColumn < anchorIndex
        ? Math.min(anchorIndex, rawColumn + RESIZE_SNAP_THRESHOLD)
        : rawColumn;

  return Math.min(6, Math.max(0, Math.floor(adjustedColumn)));
}

export function ScheduleCalendarPage({ loginId }: ScheduleCalendarPageProps) {
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const dragPreviewElementRef = useRef<HTMLElement | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragPreviewStateRef = useRef<CalendarDragPreview | null>(null);
  const dragClickSuppressedRef = useRef(false);
  const editFormRef = useRef<HTMLFormElement | null>(null);
  const latestMovePointRef = useRef<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>(
    getDefaultCalendarViewMode,
  );
  const [monthValue, setMonthValue] = useState(getMonthInputValue(new Date()));
  const [todayScrollRequest, setTodayScrollRequest] = useState(0);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [dragState, setDragState] = useState<CalendarDragState | null>(null);
  const [dragPreview, setDragPreview] = useState<CalendarDragPreview | null>(
    null,
  );
  const [createModalDate, setCreateModalDate] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<ScheduleCreateDraft>(() =>
    createEmptyScheduleDraft(toInputDate(new Date())),
  );
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editDraft, setEditDraft] = useState<ScheduleEditDraft | null>(null);
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const todayDate = useMemo(() => toInputDate(new Date()), []);
  const visibleDates = useMemo(
    () => createVisibleDates(monthValue),
    [monthValue],
  );
  const calendarWeeks = useMemo(
    () => createCalendarWeeks(events, visibleDates),
    [events, visibleDates],
  );
  const agendaDays = useMemo(
    () => createAgendaDays(events, visibleDates, monthValue),
    [events, monthValue, visibleDates],
  );
  const dragPreviewEvent = useMemo(
    () =>
      dragPreview
        ? (events.find(
            (calendarEvent) => calendarEvent.id === dragPreview.eventId,
          ) ?? null)
        : null,
    [dragPreview, events],
  );
  useEffect(() => {
    dragPreviewStateRef.current = dragPreview;
  }, [dragPreview]);

  const changeMonthValue = (nextMonthValue: string) => {
    if (!isValidMonthInputValue(nextMonthValue)) {
      return;
    }

    setMonthValue(nextMonthValue);
  };

  const calculateDragPreviewStyle = (
    preview: CalendarDragPreview,
    previewEvent: CalendarEvent,
  ) => {
    if (preview.mode === "move") {
      return {
        height: preview.height,
        left: preview.clientX - preview.offsetX,
        top: preview.clientY - preview.offsetY,
        width: preview.width,
      };
    }

    const weekRows = calendarGridRef.current?.querySelectorAll<HTMLElement>(
      "[data-calendar-week-index]",
    );

    if (weekRows) {
      for (const weekRow of weekRows) {
        const rect = weekRow.getBoundingClientRect();

        if (
          preview.clientY < rect.top ||
          preview.clientY > rect.bottom ||
          preview.clientX < rect.left ||
          preview.clientX > rect.right
        ) {
          continue;
        }

        const weekIndex = Number(weekRow.dataset.calendarWeekIndex);
        const weekDates = visibleDates.slice(weekIndex * 7, weekIndex * 7 + 7);
        const columnWidth = rect.width / 7;
        const columnIndex = getPointerColumnIndex(
          preview.clientX,
          rect,
          preview.mode,
          getResizeAnchorIndex(previewEvent, preview.mode, weekDates),
        );
        const targetDate = visibleDates[weekIndex * 7 + columnIndex];
        const previewStartDate =
          preview.mode === "resize-start"
            ? targetDate <= previewEvent.endDate
              ? targetDate
              : previewEvent.endDate
            : previewEvent.startDate;
        const previewEndDate =
          preview.mode === "resize-end"
            ? targetDate >= previewEvent.startDate
              ? targetDate
              : previewEvent.startDate
            : previewEvent.endDate;
        const previewSegment = createEventSegment(
          {
            ...previewEvent,
            endDate: previewEndDate,
            startDate: previewStartDate,
          },
          weekDates,
        );

        if (!previewSegment) {
          break;
        }

        const left =
          rect.left + (previewSegment.startColumn - 1) * columnWidth + 8;
        const right =
          rect.left + (previewSegment.endColumn - 1) * columnWidth - 8;

        return {
          height: preview.height,
          left,
          top: preview.y,
          width: Math.max(36, right - left),
        };
      }
    }

    return {
      height: preview.height,
      left: preview.clientX - preview.offsetX,
      top: preview.clientY - preview.offsetY,
      width: preview.width,
    };
  };

  const dragPreviewStyle = useMemo(() => {
    if (!dragPreview || !dragPreviewEvent) {
      return undefined;
    }

    return calculateDragPreviewStyle(dragPreview, dragPreviewEvent);
  }, [dragPreview, dragPreviewEvent, visibleDates]);

  const applyDragPreviewStyle = (
    preview: CalendarDragPreview,
    previewEvent: CalendarEvent,
  ) => {
    const previewElement = dragPreviewElementRef.current;

    if (!previewElement) {
      return;
    }

    const nextStyle = calculateDragPreviewStyle(preview, previewEvent);
    previewElement.style.height = `${nextStyle.height}px`;
    previewElement.style.left = `${nextStyle.left}px`;
    previewElement.style.top = `${nextStyle.top}px`;
    previewElement.style.width = `${nextStyle.width}px`;
  };

  useEffect(() => {
    let isMounted = true;

    setIsCalendarLoading(true);
    setStatusMessage("일정을 불러오는 중입니다.");
    Promise.all([
      fetchWorkTypes(),
      Promise.all(
        visibleDates.map((date) =>
          fetchScheduleTasks(loginId, date).then((tasks) =>
            tasks.map((task) => ({ ...task, date })),
          ),
        ),
      ),
    ])
      .then(([nextWorkTypes, datedTaskGroups]) => {
        if (!isMounted) {
          return;
        }

        setWorkTypes(nextWorkTypes);
        setEvents(groupTasksIntoEvents(datedTaskGroups.flat()));
        setStatusMessage("");
        setIsCalendarLoading(false);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setEvents([]);
        setStatusMessage("일정을 불러오지 못했습니다.");
        setIsCalendarLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [loginId, reloadToken, visibleDates]);

  useEffect(() => {
    if (
      isCalendarLoading ||
      monthValue !== getMonthInputValue(new Date())
    ) {
      return;
    }

    const selector =
      calendarViewMode === "calendar"
        ? `[data-calendar-date="${todayDate}"]`
        : `[data-calendar-agenda-date="${todayDate}"]`;

    document.querySelector<HTMLElement>(selector)?.scrollIntoView({
      behavior: todayScrollRequest > 0 ? "smooth" : "auto",
      block: "center",
      inline: "nearest",
    });
  }, [
    calendarViewMode,
    isCalendarLoading,
    monthValue,
    todayDate,
    todayScrollRequest,
  ]);

  const moveMonth = (months: number) => {
    const [year, month] = monthValue.split("-").map(Number);
    const baseDate =
      Number.isFinite(year) && Number.isFinite(month)
        ? new Date(year, month - 1 + months, 1)
        : new Date();

    changeMonthValue(getMonthInputValue(baseDate));
  };

  const moveToToday = () => {
    changeMonthValue(getMonthInputValue(new Date()));
    setTodayScrollRequest((currentRequest) => currentRequest + 1);
  };

  const createAdjustedEvent = (
    event: CalendarEvent,
    targetDate: string,
    mode: CalendarDragState["mode"],
  ) => {
    if (mode === "move") {
      const duration = diffDays(event.endDate, event.startDate);

      return {
        ...event,
        endDate: addDays(targetDate, duration),
        startDate: targetDate,
      };
    }

    if (mode === "resize-start") {
      return {
        ...event,
        startDate: targetDate <= event.endDate ? targetDate : event.endDate,
      };
    }

    return {
      ...event,
      endDate: targetDate >= event.startDate ? targetDate : event.startDate,
    };
  };

  const resolveDateFromPointer = (
    clientX: number,
    clientY: number,
    mode: CalendarDragState["mode"],
    event: CalendarEvent,
  ) => {
    const weekRows = calendarGridRef.current?.querySelectorAll<HTMLElement>(
      "[data-calendar-week-index]",
    );

    if (!weekRows) {
      return undefined;
    }

    for (const weekRow of weekRows) {
      const rect = weekRow.getBoundingClientRect();

      if (
        clientY < rect.top ||
        clientY > rect.bottom ||
        clientX < rect.left ||
        clientX > rect.right
      ) {
        continue;
      }

      const weekIndex = Number(weekRow.dataset.calendarWeekIndex);
      const weekDates = visibleDates.slice(weekIndex * 7, weekIndex * 7 + 7);
      const columnIndex = getPointerColumnIndex(
        clientX,
        rect,
        mode,
        mode === "move"
          ? undefined
          : getResizeAnchorIndex(event, mode, weekDates),
      );

      return visibleDates[weekIndex * 7 + columnIndex];
    }

    return undefined;
  };

  const resolveDateFromCalendarPoint = (clientX: number, clientY: number) => {
    const weekRows = calendarGridRef.current?.querySelectorAll<HTMLElement>(
      "[data-calendar-week-index]",
    );

    if (!weekRows) {
      return undefined;
    }

    for (const weekRow of weekRows) {
      const rect = weekRow.getBoundingClientRect();

      if (
        clientY < rect.top ||
        clientY > rect.bottom ||
        clientX < rect.left ||
        clientX > rect.right
      ) {
        continue;
      }

      const weekIndex = Number(weekRow.dataset.calendarWeekIndex);
      const columnIndex = getPointerColumnIndex(clientX, rect, "move");

      return visibleDates[weekIndex * 7 + columnIndex];
    }

    return undefined;
  };

  const openCreateModal = (date: string) => {
    setCreateDraft(createEmptyScheduleDraft(date));
    setCreateModalDate(date);
  };

  const closeCreateModal = () => {
    if (isCreatingSchedule) {
      return;
    }

    setCreateModalDate(null);
  };

  const handleCalendarEmptyClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (dragState) {
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest(
        "article, button, input, select, textarea, [data-calendar-block-click], [data-calendar-modal]",
      )
    ) {
      return;
    }

    const date = resolveDateFromCalendarPoint(event.clientX, event.clientY);
    if (date) {
      openCreateModal(date);
    }
  };

  const selectFarmOwner = (farmOwner: FarmOwnerOption) => {
    setCreateDraft((currentDraft) => ({
      ...currentDraft,
      ownerName: farmOwner.displayName,
      ownerQuery: farmOwner.displayName,
      ownerUuid: farmOwner.uuid,
    }));
  };

  const selectEditFarmOwner = (farmOwner: FarmOwnerOption) => {
    setEditDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            ownerName: farmOwner.displayName,
            ownerQuery: farmOwner.displayName,
            ownerUuid: farmOwner.uuid,
          }
        : currentDraft,
    );
  };

  const toggleCreateWorkType = (workTypeCode: string) => {
    setCreateDraft((currentDraft) => ({
      ...currentDraft,
      workTypeCodes: currentDraft.workTypeCodes.includes(workTypeCode)
        ? currentDraft.workTypeCodes.filter((code) => code !== workTypeCode)
        : [...currentDraft.workTypeCodes, workTypeCode],
    }));
  };

  const submitCreateSchedule = async () => {
    if (!createDraft.ownerUuid) {
      window.alert("농장주를 선택해주세요.");
      return;
    }

    if (!createDraft.title.trim()) {
      window.alert("작업내용을 입력해주세요.");
      return;
    }

    if (!createDraft.address.trim()) {
      window.alert("농장주소를 입력해주세요.");
      return;
    }

    if (createDraft.endDate < createDraft.startDate) {
      window.alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    if (
      createDraft.startTime &&
      createDraft.endTime &&
      createDraft.endTime <= createDraft.startTime
    ) {
      window.alert("종료시간은 시작시간보다 늦어야 합니다.");
      return;
    }

    setIsCreatingSchedule(true);
    try {
      await createScheduleTask(loginId, {
        address: createDraft.address.trim(),
        endDate: createDraft.endDate,
        endTime: createDraft.endTime || null,
        memo: createDraft.memo.trim(),
        ownerUuid: createDraft.ownerUuid,
        requiredMen: Number(createDraft.requiredMen) || 0,
        requiredWomen: Number(createDraft.requiredWomen) || 0,
        siteName: createDraft.siteName.trim(),
        startDate: createDraft.startDate,
        startTime: createDraft.startTime || null,
        title: createDraft.title.trim(),
        workTypeCodes: createDraft.workTypeCodes,
      });
      setStatusMessage("일정을 등록했습니다.");
      setCreateModalDate(null);
      setReloadToken((token) => token + 1);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "일정을 등록하지 못했습니다.",
      );
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEditDraft(createEditScheduleDraft(event));
  };

  const closeEditModal = () => {
    if (isUpdatingSchedule) {
      return;
    }

    setEditingEvent(null);
    setEditDraft(null);
  };

  const toggleEditWorkType = (workTypeCode: string) => {
    setEditDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            workTypeCodes: currentDraft.workTypeCodes.includes(workTypeCode)
              ? currentDraft.workTypeCodes.filter(
                  (code) => code !== workTypeCode,
                )
              : [...currentDraft.workTypeCodes, workTypeCode],
          }
        : currentDraft,
    );
  };

  const submitEditSchedule = async () => {
    if (!editingEvent || !editDraft) {
      return;
    }

    const formData = editFormRef.current
      ? new FormData(editFormRef.current)
      : null;
    const title = String(formData?.get("title") ?? "").trim();
    const address = String(formData?.get("address") ?? "").trim();
    const memo = String(formData?.get("memo") ?? "").trim();
    const requiredMen = Number(formData?.get("requiredMen")) || 0;
    const requiredWomen = Number(formData?.get("requiredWomen")) || 0;

    if (!title) {
      window.alert("작업내용을 입력해주세요.");
      return;
    }

    if (!address) {
      window.alert("농장주소를 입력해주세요.");
      return;
    }

    if (!editDraft.ownerUuid) {
      window.alert("농장주를 선택해주세요.");
      return;
    }

    if (editDraft.endDate < editDraft.startDate) {
      window.alert("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    setIsUpdatingSchedule(true);
    try {
      const savedTask = await updateScheduleTask(
        loginId,
        editingEvent.sourceDates[0] ?? editingEvent.startDate,
        editingEvent.taskIds[0],
        {
          address,
          assignments: editingEvent.assignments,
          endTime: editingEvent.endTime || null,
          memo,
          ownerUuid: editDraft.ownerUuid,
          requiredMen,
          requiredWomen,
          startTime: editingEvent.startTime || null,
          title,
          workTypeCodes: editDraft.workTypeCodes,
        },
      );

      if (
        editDraft.startDate !== editingEvent.startDate ||
        editDraft.endDate !== editingEvent.endDate
      ) {
        await rescheduleScheduleRange(loginId, {
          endDate: editDraft.endDate,
          startDate: editDraft.startDate,
          taskIds: editingEvent.taskIds,
        });
      }

      setEvents((currentEvents) =>
        currentEvents.map((calendarEvent) =>
          calendarEvent.id === editingEvent.id
            ? {
                ...calendarEvent,
                address: savedTask.address,
                endDate: editDraft.endDate,
                memo: savedTask.memo,
                requiredMen: savedTask.requiredMen,
                requiredWomen: savedTask.requiredWomen,
                ownerName: savedTask.ownerName,
                ownerUuid: savedTask.ownerUuid,
                startDate: editDraft.startDate,
                title: savedTask.title,
                workTypeCodes: savedTask.workTypeCodes,
              }
            : calendarEvent,
        ),
      );
      setStatusMessage("작업내용을 저장했습니다.");
      setEditingEvent(null);
      setEditDraft(null);
      setReloadToken((token) => token + 1);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "작업내용을 저장하지 못했습니다.",
      );
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const deleteEditSchedule = async () => {
    if (!editingEvent) {
      return;
    }

    const shouldDelete = window.confirm(
      "이 일정을 삭제할까요? DB에서는 삭제 시각만 기록하고 목록에서 숨깁니다.",
    );
    if (!shouldDelete) {
      return;
    }

    setIsUpdatingSchedule(true);
    try {
      await deleteScheduleTaskRange(loginId, { taskIds: editingEvent.taskIds });
      setEvents((currentEvents) =>
        currentEvents.filter(
          (calendarEvent) => calendarEvent.id !== editingEvent.id,
        ),
      );
      setStatusMessage("일정을 삭제했습니다.");
      setEditingEvent(null);
      setEditDraft(null);
      setReloadToken((token) => token + 1);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "일정을 삭제하지 못했습니다.",
      );
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    const currentPreview = dragPreviewStateRef.current;

    if (!currentPreview) {
      return;
    }

    if (currentPreview.mode === "move") {
      const movedDistance = Math.hypot(
        event.clientX - currentPreview.clientX,
        event.clientY - currentPreview.clientY,
      );

      if (movedDistance > 5) {
        dragClickSuppressedRef.current = true;
      }
    } else {
      dragClickSuppressedRef.current = true;
    }

    latestMovePointRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };

    if (dragPreviewFrameRef.current === null) {
      dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
        const latestPoint = latestMovePointRef.current;
        const previewState = dragPreviewStateRef.current;
        const previewEvent = previewState
          ? events.find(
              (calendarEvent) => calendarEvent.id === previewState.eventId,
            )
          : null;

        dragPreviewFrameRef.current = null;

        if (!latestPoint || !previewState || !previewEvent) {
          return;
        }

        applyDragPreviewStyle(
          {
            ...previewState,
            clientX: latestPoint.clientX,
            clientY: latestPoint.clientY,
          },
          previewEvent,
        );
      });
    }
  };

  const finishDrag = (event: PointerEvent) => {
    if (!dragState) {
      return;
    }

    const currentEvent = events.find(
      (calendarEvent) => calendarEvent.id === dragState.eventId,
    );

    if (currentEvent) {
      const targetElement = document.elementFromPoint(
        event.clientX,
        event.clientY,
      );
      const dateCell = targetElement?.closest<HTMLElement>(
        "[data-calendar-date]",
      );
      const targetDate =
        resolveDateFromPointer(
          event.clientX,
          event.clientY,
          dragState.mode,
          currentEvent,
        ) ?? dateCell?.dataset.calendarDate;

      if (targetDate) {
        const adjustedEvent = createAdjustedEvent(
          currentEvent,
          targetDate,
          dragState.mode,
        );

        if (
          adjustedEvent.startDate !== currentEvent.startDate ||
          adjustedEvent.endDate !== currentEvent.endDate
        ) {
          setEvents((currentEvents) =>
            currentEvents.map((calendarEvent) =>
              calendarEvent.id === adjustedEvent.id
                ? adjustedEvent
                : calendarEvent,
            ),
          );
          setStatusMessage("일정 변경을 저장하는 중입니다.");
          rescheduleScheduleRange(loginId, {
            endDate: adjustedEvent.endDate,
            startDate: adjustedEvent.startDate,
            taskIds: adjustedEvent.taskIds,
          })
            .then(() => {
              setStatusMessage("일정 변경을 저장했습니다.");
              setReloadToken((token) => token + 1);
            })
            .catch((error) => {
              window.alert(
                error instanceof Error
                  ? error.message
                  : "일정 기간을 저장하지 못했습니다.",
              );
              setStatusMessage("일정 변경 저장에 실패했습니다.");
              setReloadToken((token) => token + 1);
            });
        }
      }
    }

    setDragState(null);
    setDragPreview(null);
    latestMovePointRef.current = null;

    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }

    window.setTimeout(() => {
      dragClickSuppressedRef.current = false;
    }, 0);
  };
  useEffect(() => {
    if (!dragState) {
      return;
    }

    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", finishDrag);
    document.addEventListener("pointermove", handlePointerMove);

    return () => {
      document.removeEventListener("pointerup", finishDrag);
      document.removeEventListener("pointercancel", finishDrag);
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [dragState]);

  const startEventDrag = (
    event: CalendarEvent,
    mode: CalendarDragState["mode"],
    pointerEvent: ReactPointerEvent<HTMLElement>,
  ) => {
    if (pointerEvent.button !== 0) {
      return;
    }

    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const sourceElement =
      pointerEvent.currentTarget.closest<HTMLElement>("article") ??
      pointerEvent.currentTarget;
    const sourceRect = sourceElement.getBoundingClientRect();
    dragClickSuppressedRef.current = mode !== "move";
    const nextPreview = {
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY,
      eventId: event.id,
      height: sourceRect.height,
      mode,
      offsetX: pointerEvent.clientX - sourceRect.left,
      offsetY: pointerEvent.clientY - sourceRect.top,
      width: sourceRect.width,
      x: sourceRect.left,
      y: sourceRect.top,
    };

    setDragState({ eventId: event.id, mode });
    dragPreviewStateRef.current = nextPreview;
    setDragPreview(nextPreview);
  };

  return (
    <main className={styles.tableMainContent}>
      <section
        className={styles.calendarPanel}
        aria-labelledby="schedule-title"
      >
        <div className={styles.calendarHeader}>
          <div>
            <p className={styles.sectionLabel}>일정 관리</p>
            <h1 id="schedule-title">{getMonthLabel(monthValue)}</h1>
            {statusMessage ? (
              <p className={styles.calendarStatusMessage}>{statusMessage}</p>
            ) : null}
          </div>
          <div className={styles.calendarControls}>
            <button type="button" onClick={() => moveMonth(-1)}>
              ◀ 이전
            </button>
            <input
              aria-label="일정 월 선택"
              type="month"
              value={monthValue}
              onChange={(event) => changeMonthValue(event.target.value)}
            />
            <button
              type="button"
              onClick={moveToToday}
            >
              오늘
            </button>
            <button type="button" onClick={() => moveMonth(1)}>
              다음 ▶
            </button>
            <div
              aria-label="일정 보기 방식"
              className={styles.calendarViewToggle}
              role="group"
            >
              <button
                aria-pressed={calendarViewMode === "calendar"}
                className={
                  calendarViewMode === "calendar"
                    ? styles.selectedCalendarViewButton
                    : ""
                }
                type="button"
                onClick={() => setCalendarViewMode("calendar")}
              >
                캘린더
              </button>
              <button
                aria-pressed={calendarViewMode === "agenda"}
                className={
                  calendarViewMode === "agenda"
                    ? styles.selectedCalendarViewButton
                    : ""
                }
                type="button"
                onClick={() => setCalendarViewMode("agenda")}
              >
                아젠다
              </button>
            </div>
          </div>
        </div>

        <div
          className={`${styles.calendarMonthView} ${
            calendarViewMode === "calendar" ? "" : styles.calendarViewHidden
          }`}
        >
          <div className={styles.calendarWeekHeader}>
            {DAY_NAMES.map((dayName) => (
              <div key={dayName}>{dayName}</div>
            ))}
          </div>

          <div className={styles.calendarGrid} ref={calendarGridRef}>
            {calendarWeeks.map((week, weekIndex) => (
              <section
                className={styles.calendarWeekRow}
                data-calendar-week-index={weekIndex}
                key={week.id}
                onClick={handleCalendarEmptyClick}
              >
                <div className={styles.calendarWeekBackground}>
                  {week.dates.map((date) => (
                    <div
                      className={`${styles.calendarDayCell} ${
                        isCurrentMonth(date, monthValue)
                          ? ""
                          : styles.outsideMonthDay
                      } ${date === todayDate ? styles.todayCalendarDay : ""}`}
                      data-calendar-date={date}
                      key={date}
                    >
                      <div className={styles.calendarDayNumber}>
                        {getDateDayLabel(date)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className={styles.calendarOwnerGroupList}>
                  {week.dates.includes(todayDate) ? (
                    <div
                      aria-hidden="true"
                      className={styles.calendarTodayColumn}
                      style={{
                        left: `calc(${week.dates.indexOf(todayDate)} * 100% / 7)`,
                      }}
                    />
                  ) : null}
                  {week.ownerLanes.length === 0 ? (
                    <div className={styles.calendarEmptyWeek}>
                      등록된 작업 일정이 없습니다.
                    </div>
                  ) : null}
                  {week.ownerLanes.map((ownerLane) => (
                    <div
                      className={styles.calendarOwnerLane}
                      key={ownerLane.id}
                    >
                      <div className={styles.calendarOwnerGrid}>
                        {ownerLane.groups.map((ownerGroup) => (
                          <div
                            className={styles.calendarOwnerBar}
                            data-calendar-block-click
                            key={ownerGroup.id}
                            style={{
                              gridColumn: `${ownerGroup.startColumn} / ${ownerGroup.endColumn}`,
                            }}
                          >
                            {ownerGroup.ownerName}
                          </div>
                        ))}
                      </div>
                      <div
                        className={styles.calendarWorkGrid}
                        style={{
                          gridTemplateRows: `repeat(${ownerLane.laneCount}, minmax(74px, auto))`,
                        }}
                      >
                        {ownerLane.groups
                          .flatMap((ownerGroup) => ownerGroup.segments)
                          .map((segment) => {
                            const event = segment.event;

                            return (
                              <article
                                className={`${styles.calendarEventCard} ${
                                  dragState?.eventId === event.id
                                    ? styles.draggingCalendarEvent
                                    : ""
                                }`}
                                data-calendar-block-click
                                key={`${event.id}-${segment.startDate}-${segment.endDate}`}
                                onPointerDown={(pointerEvent) =>
                                  startEventDrag(event, "move", pointerEvent)
                                }
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  if (!dragClickSuppressedRef.current) {
                                    openEditModal(event);
                                  }
                                }}
                                style={{
                                  gridColumn: `${segment.startColumn} / ${segment.endColumn}`,
                                  gridRow: segment.lane + 1,
                                }}
                              >
                                {segment.isStart ? (
                                  <button
                                    aria-label="일정 시작일 조절"
                                    className={styles.calendarResizeHandleStart}
                                    type="button"
                                    onPointerDown={(pointerEvent) =>
                                      startEventDrag(
                                        event,
                                        "resize-start",
                                        pointerEvent,
                                      )
                                    }
                                  />
                                ) : null}
                                <div className={styles.calendarEventTitle}>
                                  {event.title || "작업 미입력"}
                                </div>
                                <div className={styles.calendarEventMeta}>
                                  <span>
                                    {event.siteName ||
                                      event.address ||
                                      "작업 장소 미입력"}
                                  </span>
                                  <span>
                                    남 {event.requiredMen} / 여{" "}
                                    {event.requiredWomen}
                                  </span>
                                </div>
                                {event.memo ? (
                                  <div className={styles.calendarEventMemo}>
                                    {event.memo}
                                  </div>
                                ) : null}
                                {segment.isEnd ? (
                                  <button
                                    aria-label="일정 종료일 조절"
                                    className={styles.calendarResizeHandleEnd}
                                    type="button"
                                    onPointerDown={(pointerEvent) =>
                                      startEventDrag(
                                        event,
                                        "resize-end",
                                        pointerEvent,
                                      )
                                    }
                                  />
                                ) : null}
                              </article>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div
          className={`${styles.calendarMobileAgenda} ${
            calendarViewMode === "agenda" ? styles.calendarAgendaActive : ""
          }`}
        >
          {agendaDays.map((agendaDay) => (
            <section
              className={`${styles.mobileAgendaDay} ${
                agendaDay.date === todayDate ? styles.todayAgendaDay : ""
              }`}
              data-calendar-agenda-date={agendaDay.date}
              key={agendaDay.id}
            >
              <div className={styles.mobileAgendaDayHeader}>
                <div>
                  <strong>{getAgendaDateLabel(agendaDay.date)}</strong>
                  <span>{agendaDay.events.length}건</span>
                </div>
                <button
                  aria-label={`${getAgendaDateLabel(agendaDay.date)} 일정 추가`}
                  type="button"
                  onClick={() => openCreateModal(agendaDay.date)}
                >
                  +
                </button>
              </div>
              {agendaDay.events.length > 0 ? (
                <div className={styles.mobileAgendaEventList}>
                  {agendaDay.events.map((event) => (
                    <button
                      className={styles.mobileAgendaEventCard}
                      key={`${agendaDay.date}-${event.id}`}
                      type="button"
                      onClick={() => openEditModal(event)}
                    >
                      <span className={styles.mobileAgendaOwner}>
                        {event.ownerName}
                      </span>
                      <span className={styles.mobileAgendaTitle}>
                        {event.title || "작업 미입력"}
                      </span>
                      <span className={styles.mobileAgendaMeta}>
                        {event.siteName || event.address || "작업 장소 미입력"}
                      </span>
                      <span className={styles.mobileAgendaMeta}>
                        남 {event.requiredMen} / 여 {event.requiredWomen}
                        {event.timeRange ? ` · ${event.timeRange}` : ""}
                      </span>
                      {event.memo ? (
                        <span className={styles.mobileAgendaMemo}>
                          {event.memo}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.mobileAgendaEmpty}>
                  등록된 작업 일정이 없습니다.
                </div>
              )}
            </section>
          ))}
        </div>
        {createModalDate ? (
          <div
            className={styles.scheduleCreateOverlay}
            data-calendar-modal
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeCreateModal();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <section
              aria-labelledby="schedule-create-title"
              className={styles.scheduleCreateModal}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className={styles.scheduleCreateHeader}>
                <h2 id="schedule-create-title">일정 추가</h2>
                <div className={styles.scheduleCreateActions}>
                  <button
                    className={styles.scheduleCreatePrimaryButton}
                    disabled={isCreatingSchedule}
                    type="button"
                    onClick={submitCreateSchedule}
                  >
                    등록
                  </button>
                  <button
                    className={styles.scheduleCreateSecondaryButton}
                    disabled={isCreatingSchedule}
                    type="button"
                    onClick={closeCreateModal}
                  >
                    취소
                  </button>
                </div>
              </div>

              <div className={styles.scheduleCreateBody}>
                <div className={styles.scheduleCreateDateRow}>
                  <label>
                    <span>시작일 *</span>
                    <input
                      type="date"
                      value={createDraft.startDate}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          endDate:
                            currentDraft.endDate < event.target.value
                              ? event.target.value
                              : currentDraft.endDate,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>종료일 *</span>
                    <input
                      type="date"
                      value={createDraft.endDate}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          endDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>시작시간</span>
                    <input
                      type="time"
                      value={createDraft.startTime}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          startTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>종료시간</span>
                    <input
                      type="time"
                      value={createDraft.endTime}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          endTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <FarmOwnerSearchField
                  initialQuery={createDraft.ownerQuery}
                  label="농장주 *"
                  loginId={loginId}
                  selectedOwnerUuid={createDraft.ownerUuid}
                  onInvalidate={() =>
                    setCreateDraft((currentDraft) => ({
                      ...currentDraft,
                      ownerName: "",
                      ownerUuid: "",
                    }))
                  }
                  onSelect={selectFarmOwner}
                />

                <div className={styles.scheduleCreateTwoColumn}>
                  <label>
                    <span>작업내용 *</span>
                    <input
                      placeholder="예: 마늘 뽑기"
                      type="text"
                      value={createDraft.title}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          title: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>현장명</span>
                    <input
                      placeholder="예: 동문 제1농장"
                      type="text"
                      value={createDraft.siteName}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          siteName: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <label>
                  <span>농장주소 *</span>
                  <input
                    placeholder="작업 장소 주소를 입력하세요"
                    type="text"
                    value={createDraft.address}
                    onChange={(event) =>
                      setCreateDraft((currentDraft) => ({
                        ...currentDraft,
                        address: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className={styles.scheduleCreateTwoColumn}>
                  <label>
                    <span>남자 필요인원</span>
                    <input
                      min="0"
                      type="number"
                      value={createDraft.requiredMen}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          requiredMen: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>여자 필요인원</span>
                    <input
                      min="0"
                      type="number"
                      value={createDraft.requiredWomen}
                      onChange={(event) =>
                        setCreateDraft((currentDraft) => ({
                          ...currentDraft,
                          requiredWomen: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className={styles.scheduleCreateWorkTypes}>
                  <span>작업 종류</span>
                  <div>
                    {workTypes.map((workType) => (
                      <button
                        className={
                          createDraft.workTypeCodes.includes(workType.code)
                            ? styles.selectedWorkTypeButton
                            : ""
                        }
                        key={workType.code}
                        type="button"
                        onClick={() => toggleCreateWorkType(workType.code)}
                      >
                        {workType.name}
                      </button>
                    ))}
                  </div>
                </div>

                <label>
                  <span>메모</span>
                  <textarea
                    rows={4}
                    value={createDraft.memo}
                    onChange={(event) =>
                      setCreateDraft((currentDraft) => ({
                        ...currentDraft,
                        memo: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </section>
          </div>
        ) : null}
        {editingEvent && editDraft ? (
          <div
            className={styles.scheduleCreateOverlay}
            data-calendar-modal
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeEditModal();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <section
              aria-labelledby="schedule-edit-title"
              className={styles.scheduleCreateModal}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className={styles.scheduleCreateHeader}>
                <h2 id="schedule-edit-title">작업내용 수정</h2>
                <div className={styles.scheduleEditHeaderActions}>
                  <div className={styles.scheduleCreateActions}>
                    <button
                      className={styles.scheduleDeleteButton}
                      disabled={isUpdatingSchedule}
                      type="button"
                      onClick={deleteEditSchedule}
                    >
                      삭제
                    </button>
                    <button
                      className={styles.scheduleCreatePrimaryButton}
                      disabled={isUpdatingSchedule}
                      type="button"
                      onClick={submitEditSchedule}
                    >
                      저장
                    </button>
                    <button
                      className={styles.scheduleCreateSecondaryButton}
                      disabled={isUpdatingSchedule}
                      type="button"
                      onClick={closeEditModal}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </div>

              <form
                className={styles.scheduleCreateBody}
                ref={editFormRef}
                onSubmit={(event) => {
                  event.preventDefault();
                  submitEditSchedule();
                }}
              >
                <div className={styles.scheduleEditSummary}>
                  <strong>{editingEvent.ownerName}</strong>
                  <span>
                    {editingEvent.startDate}
                    {editingEvent.endDate !== editingEvent.startDate
                      ? ` - ${editingEvent.endDate}`
                      : ""}
                  </span>
                </div>

                <div className={styles.scheduleCreateDateRow}>
                  <label>
                    <span>시작일 *</span>
                    <input
                      type="date"
                      value={editDraft.startDate}
                      onChange={(event) =>
                        setEditDraft((currentDraft) =>
                          currentDraft
                            ? {
                                ...currentDraft,
                                endDate:
                                  currentDraft.endDate < event.target.value
                                    ? event.target.value
                                    : currentDraft.endDate,
                                startDate: event.target.value,
                              }
                            : currentDraft,
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>종료일 *</span>
                    <input
                      type="date"
                      value={editDraft.endDate}
                      onChange={(event) =>
                        setEditDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, endDate: event.target.value }
                            : currentDraft,
                        )
                      }
                    />
                  </label>
                </div>

                <FarmOwnerSearchField
                  initialQuery={editDraft.ownerQuery}
                  label="농장주 *"
                  loginId={loginId}
                  selectedOwnerUuid={editDraft.ownerUuid}
                  onInvalidate={() =>
                    setEditDraft((currentDraft) =>
                      currentDraft
                        ? {
                            ...currentDraft,
                            ownerName: "",
                            ownerUuid: "",
                          }
                        : currentDraft,
                    )
                  }
                  onSelect={selectEditFarmOwner}
                />

                <label>
                  <span>작업내용 *</span>
                  <input
                    name="title"
                    type="text"
                    defaultValue={editDraft.title}
                  />
                </label>

                <label>
                  <span>농장주소 *</span>
                  <input
                    name="address"
                    type="text"
                    defaultValue={editDraft.address}
                  />
                </label>

                <div className={styles.scheduleCreateTwoColumn}>
                  <label>
                    <span>남자 필요인원</span>
                    <input
                      min="0"
                      name="requiredMen"
                      type="number"
                      defaultValue={editDraft.requiredMen}
                    />
                  </label>
                  <label>
                    <span>여자 필요인원</span>
                    <input
                      min="0"
                      name="requiredWomen"
                      type="number"
                      defaultValue={editDraft.requiredWomen}
                    />
                  </label>
                </div>

                <div className={styles.scheduleCreateWorkTypes}>
                  <span>작업 종류</span>
                  <div>
                    {workTypes.map((workType) => (
                      <button
                        className={
                          editDraft.workTypeCodes.includes(workType.code)
                            ? styles.selectedWorkTypeButton
                            : ""
                        }
                        key={workType.code}
                        type="button"
                        onClick={() => toggleEditWorkType(workType.code)}
                      >
                        {workType.name}
                      </button>
                    ))}
                  </div>
                </div>

                <label>
                  <span>메모</span>
                  <textarea
                    name="memo"
                    rows={4}
                    defaultValue={editDraft.memo}
                  />
                </label>
              </form>
            </section>
          </div>
        ) : null}
        {dragPreview && dragPreviewEvent && dragPreviewStyle ? (
          <article
            className={`${styles.calendarEventCard} ${styles.calendarDragPreview} ${
              dragPreview.mode === "move"
                ? styles.calendarMovePreview
                : styles.calendarResizePreview
            }`}
            ref={dragPreviewElementRef}
            style={dragPreviewStyle}
          >
            <div className={styles.calendarEventTitle}>
              {dragPreviewEvent.title || "작업 미입력"}
            </div>
            <div className={styles.calendarEventMeta}>
              <span>
                {dragPreviewEvent.siteName ||
                  dragPreviewEvent.address ||
                  "작업 장소 미입력"}
              </span>
              <span>
                남 {dragPreviewEvent.requiredMen} / 여{" "}
                {dragPreviewEvent.requiredWomen}
              </span>
            </div>
            {dragPreviewEvent.memo ? (
              <div className={styles.calendarEventMemo}>
                {dragPreviewEvent.memo}
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </main>
  );
}
