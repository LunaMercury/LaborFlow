import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import styles from "./WorkerWorkTypeCell.module.css";
import type { WorkTypeOption } from "../data/workTypeOptions";
import {
  addUnratedWorkTypeRating,
  getWorkSkillGrade,
  getWorkSkillGradeDefinition,
  removeWorkTypeRating,
  resolveRatingForGradeSelection,
  WORK_SKILL_GRADE_DEFINITIONS,
  type WorkSkillGrade,
} from "../domain/workSkillGrade";

type WorkerWorkTypeCellProps = {
  selectedCodes: string[];
  selectedRatings?: Record<string, number>;
  showRatings?: boolean;
  workTypeOptions: WorkTypeOption[];
  onChange: (nextCodes: string[], nextRatings: Record<string, number>) => void;
};

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase("ko-KR");

export function WorkerWorkTypeCell({
  selectedCodes,
  selectedRatings = {},
  showRatings = true,
  workTypeOptions,
  onChange,
}: WorkerWorkTypeCellProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [activeGradeWorkTypeCode, setActiveGradeWorkTypeCode] = useState<string | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const [gradeMenuStyle, setGradeMenuStyle] = useState<CSSProperties>({});
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gradeButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const gradeMenuRef = useRef<HTMLDivElement>(null);

  const selectedWorkTypes = useMemo(
    () => workTypeOptions.filter((workType) => selectedCodes.includes(workType.code)),
    [selectedCodes],
  );

  const filteredWorkTypes = useMemo(() => {
    const normalizedSearchTerm = normalizeSearchText(searchTerm);

    return workTypeOptions.filter((workType) => {
      if (selectedCodes.includes(workType.code)) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return (
        normalizeSearchText(workType.name).includes(normalizedSearchTerm) ||
        normalizeSearchText(workType.code).includes(normalizedSearchTerm)
      );
    });
  }, [searchTerm, selectedCodes]);

  const addWorkType = (workTypeCode: string) => {
    onChange(
      [...selectedCodes, workTypeCode],
      addUnratedWorkTypeRating(selectedRatings, workTypeCode),
    );
    setSearchTerm("");
    setIsPickerOpen(false);
  };

  const removeWorkType = (workTypeCode: string) => {
    onChange(
      selectedCodes.filter((selectedCode) => selectedCode !== workTypeCode),
      removeWorkTypeRating(selectedRatings, workTypeCode),
    );
  };

  const updateWorkTypeGrade = (workTypeCode: string, grade: WorkSkillGrade) => {
    const currentRating = selectedRatings[workTypeCode];
    onChange(selectedCodes, {
      ...selectedRatings,
      [workTypeCode]: resolveRatingForGradeSelection(currentRating, grade),
    });
    setActiveGradeWorkTypeCode(null);
    gradeButtonRefs.current.get(workTypeCode)?.focus();
  };

  const openGradeMenu = (workTypeCode: string, button: HTMLButtonElement) => {
    const viewportPadding = 8;
    const menuGap = 6;
    const buttonRect = button.getBoundingClientRect();
    const menuWidth = Math.min(340, window.innerWidth - viewportPadding * 2);
    const maxViewportHeight = window.innerHeight - viewportPadding * 2;
    const availableBelow = window.innerHeight - buttonRect.bottom - menuGap - viewportPadding;
    const availableAbove = buttonRect.top - menuGap - viewportPadding;
    const shouldOpenBelow = availableBelow >= availableAbove;
    const gradeMenuHeight = Math.min(
      390,
      Math.max(120, shouldOpenBelow ? availableBelow : availableAbove),
      maxViewportHeight,
    );
    const top = shouldOpenBelow
      ? Math.min(buttonRect.bottom + menuGap, window.innerHeight - gradeMenuHeight - viewportPadding)
      : Math.max(viewportPadding, buttonRect.top - gradeMenuHeight - menuGap);
    const left = Math.min(
      Math.max(viewportPadding, buttonRect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );

    setGradeMenuStyle({
      left,
      maxHeight: gradeMenuHeight,
      top,
      width: menuWidth,
    });
    setActiveGradeWorkTypeCode(workTypeCode);
  };

  const handleGradeMenuNavigation = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const options = Array.from(
      gradeMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? Math.min(options.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);

    event.preventDefault();
    options[nextIndex]?.focus();
  };

  useLayoutEffect(() => {
    if (!isPickerOpen || !addButtonRef.current) {
      return;
    }

    const updateDropdownPosition = () => {
      const buttonRect = addButtonRef.current?.getBoundingClientRect();

      if (!buttonRect) {
        return;
      }

      const viewportPadding = 8;
      const dropdownGap = 8;
      const viewportHeight = window.innerHeight;
      const dropdownWidth = Math.min(260, window.innerWidth - viewportPadding * 2);
      const availableBelow = window.innerHeight - buttonRect.bottom - dropdownGap - viewportPadding;
      const availableAbove = buttonRect.top - dropdownGap - viewportPadding;
      const maxUsableHeight = Math.max(64, viewportHeight - viewportPadding * 2);
      const shouldOpenBelow = availableBelow >= availableAbove;
      const availableHeight = shouldOpenBelow ? availableBelow : availableAbove;
      const shouldUseCompactPanel = Math.max(availableBelow, availableAbove) < 180;
      const dropdownHeight = shouldUseCompactPanel
        ? maxUsableHeight
        : Math.min(260, Math.max(96, availableHeight), maxUsableHeight);
      const preferredTop = shouldUseCompactPanel
        ? viewportPadding
        : shouldOpenBelow
          ? buttonRect.bottom + dropdownGap
          : buttonRect.top - dropdownGap - dropdownHeight;
      const top = Math.min(
        Math.max(viewportPadding, preferredTop),
        viewportHeight - dropdownHeight - viewportPadding,
      );
      const left = Math.min(
        Math.max(viewportPadding, buttonRect.right - dropdownWidth),
        window.innerWidth - dropdownWidth - viewportPadding,
      );

      setDropdownStyle({
        height: dropdownHeight,
        left,
        top,
        width: dropdownWidth,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const closePickerOnOutsideClick = (event: MouseEvent) => {
      const clickedNode = event.target;

      if (!(clickedNode instanceof Node)) {
        return;
      }

      if (
        addButtonRef.current?.contains(clickedNode) ||
        dropdownRef.current?.contains(clickedNode)
      ) {
        return;
      }

      setIsPickerOpen(false);
      setSearchTerm("");
    };

    const closePickerOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsPickerOpen(false);
      setSearchTerm("");
    };

    document.addEventListener("mousedown", closePickerOnOutsideClick);
    document.addEventListener("keydown", closePickerOnEscape);

    return () => {
      document.removeEventListener("mousedown", closePickerOnOutsideClick);
      document.removeEventListener("keydown", closePickerOnEscape);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    if (!activeGradeWorkTypeCode) {
      return;
    }

    const activeButton = gradeButtonRefs.current.get(activeGradeWorkTypeCode);

    const closeGradeMenuOnOutsideClick = (event: MouseEvent) => {
      const clickedNode = event.target;

      if (!(clickedNode instanceof Node)) {
        return;
      }

      if (activeButton?.contains(clickedNode) || gradeMenuRef.current?.contains(clickedNode)) {
        return;
      }

      setActiveGradeWorkTypeCode(null);
    };

    const closeGradeMenu = () => setActiveGradeWorkTypeCode(null);

    const handleGradeMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeGradeMenu();
        activeButton?.focus();
      }
    };

    document.addEventListener("mousedown", closeGradeMenuOnOutsideClick);
    document.addEventListener("keydown", handleGradeMenuKeyDown);
    window.addEventListener("resize", closeGradeMenu);
    window.addEventListener("scroll", closeGradeMenu, true);

    const focusFrame = window.requestAnimationFrame(() => {
      gradeMenuRef.current
        ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
        ?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", closeGradeMenuOnOutsideClick);
      document.removeEventListener("keydown", handleGradeMenuKeyDown);
      window.removeEventListener("resize", closeGradeMenu);
      window.removeEventListener("scroll", closeGradeMenu, true);
    };
  }, [activeGradeWorkTypeCode]);

  return (
    <div className={styles.workTypeEditor}>
      <div className={styles.workTypePillList}>
        {selectedWorkTypes.length > 0 ? (
          selectedWorkTypes.map((workType) => (
            <div className={styles.workTypePillRow} key={workType.code}>
              <span className={styles.workTypePillLabel}>{workType.name}</span>
              {showRatings ? (
                (() => {
                  const currentRating = selectedRatings[workType.code] ?? 0;
                  const currentGrade = getWorkSkillGrade(currentRating);
                  const gradeDefinition = getWorkSkillGradeDefinition(currentGrade);

                  return (
                    <button
                      aria-expanded={activeGradeWorkTypeCode === workType.code}
                      aria-haspopup="listbox"
                      aria-label={`${workType.name} 숙련도 ${gradeDefinition.displayCode}, ${gradeDefinition.label}. 등급 선택`}
                      className={styles.workTypeGradeButton}
                      ref={(button) => {
                        if (button) {
                          gradeButtonRefs.current.set(workType.code, button);
                        } else {
                          gradeButtonRefs.current.delete(workType.code);
                        }
                      }}
                      title={`${gradeDefinition.displayCode} · ${gradeDefinition.label}: ${gradeDefinition.description}`}
                      type="button"
                      onClick={(event) => {
                        if (activeGradeWorkTypeCode === workType.code) {
                          setActiveGradeWorkTypeCode(null);
                          return;
                        }

                        openGradeMenu(workType.code, event.currentTarget);
                      }}
                    >
                      <strong>{gradeDefinition.displayCode}</strong>
                      <span>{gradeDefinition.label}</span>
                    </button>
                  );
                })()
              ) : null}
              <button
                aria-label={`${workType.name} 삭제`}
                className={styles.workTypeRemoveButton}
                type="button"
                onClick={() => removeWorkType(workType.code)}
              >
                -
              </button>
            </div>
          ))
        ) : (
          <span className={styles.emptyWorkTypeText}>선택된 작업 없음</span>
        )}
      </div>

      {showRatings && activeGradeWorkTypeCode ? (
        <div
          aria-label="작업 숙련도 등급"
          className={styles.workTypeGradeMenu}
          ref={gradeMenuRef}
          role="listbox"
          style={gradeMenuStyle}
          onKeyDown={handleGradeMenuNavigation}
        >
          <p className={styles.workTypeGradeMenuIntro}>
            기존 별점은 화면에서 등급으로 환산합니다. 등급을 바꿀 때만 대표 점수가
            저장됩니다.
          </p>
          {WORK_SKILL_GRADE_DEFINITIONS.map((definition) => {
            const currentGrade = getWorkSkillGrade(
              selectedRatings[activeGradeWorkTypeCode] ?? 0,
            );

            return (
              <button
                aria-selected={currentGrade === definition.code}
                className={styles.workTypeGradeOption}
                key={definition.code}
                role="option"
                type="button"
                onClick={() =>
                  updateWorkTypeGrade(activeGradeWorkTypeCode, definition.code)
                }
              >
                <span className={styles.workTypeGradeOptionHeading}>
                  <strong>{definition.displayCode}</strong>
                  <span>{definition.label}</span>
                </span>
                <small>{definition.description}</small>
              </button>
            );
          })}
          <p className={styles.workTypeGradeMenuNote}>
            미평가는 작업 종류를 삭제하지 않습니다. D 등급도 배치 금지를 뜻하지
            않습니다.
          </p>
        </div>
      ) : null}

      <div className={styles.workTypeAddArea}>
        <button
          aria-expanded={isPickerOpen}
          className={styles.workTypeAddButton}
          ref={addButtonRef}
          type="button"
          onClick={() => setIsPickerOpen((current) => !current)}
        >
          +
        </button>

        {isPickerOpen ? (
          <div className={styles.workTypeDropdown} ref={dropdownRef} style={dropdownStyle}>
            <input
              aria-label="작업 검색"
              className={styles.workTypeSearchInput}
              placeholder="작업 검색"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            <div className={styles.workTypeOptionList}>
              {filteredWorkTypes.length > 0 ? (
                filteredWorkTypes.map((workType) => (
                  <button
                    className={styles.workTypeOptionButton}
                    key={workType.code}
                    type="button"
                    onClick={() => addWorkType(workType.code)}
                  >
                    {workType.name}
                  </button>
                ))
              ) : (
                <span className={styles.emptyWorkTypeText}>검색 결과 없음</span>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
