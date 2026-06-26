import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./WorkerWorkTypeCell.module.css";
import type { WorkTypeOption } from "../data/workTypeOptions";

type WorkerWorkTypeCellProps = {
  selectedCodes: string[];
  selectedRatings?: Record<string, number>;
  workTypeOptions: WorkTypeOption[];
  onChange: (nextCodes: string[], nextRatings: Record<string, number>) => void;
};

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase("ko-KR");

export function WorkerWorkTypeCell({
  selectedCodes,
  selectedRatings = {},
  workTypeOptions,
  onChange,
}: WorkerWorkTypeCellProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    onChange([...selectedCodes, workTypeCode], {
      ...selectedRatings,
      [workTypeCode]: selectedRatings[workTypeCode] ?? 0,
    });
    setSearchTerm("");
    setIsPickerOpen(false);
  };

  const removeWorkType = (workTypeCode: string) => {
    const nextRatings = { ...selectedRatings };
    delete nextRatings[workTypeCode];
    onChange(selectedCodes.filter((selectedCode) => selectedCode !== workTypeCode), nextRatings);
  };

  const updateWorkTypeRating = (workTypeCode: string, rating: number) => {
    onChange(selectedCodes, {
      ...selectedRatings,
      [workTypeCode]: Math.max(0, Math.min(5, rating)),
    });
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

  return (
    <div className={styles.workTypeEditor}>
      <div className={styles.workTypePillList}>
        {selectedWorkTypes.length > 0 ? (
          selectedWorkTypes.map((workType) => (
            <div className={styles.workTypePillRow} key={workType.code}>
              <span className={styles.workTypePillLabel}>{workType.name}</span>
              <div
                aria-label={`${workType.name} 별점`}
                className={styles.workTypeRatingButtons}
              >
                {[1, 2, 3, 4, 5].map((rating) => {
                  const currentRating = selectedRatings[workType.code] ?? 0;

                  return (
                    <button
                      aria-label={`${workType.name} ${rating}점`}
                      aria-pressed={currentRating === rating}
                      className={styles.workTypeRatingButton}
                      key={rating}
                      type="button"
                      onClick={() =>
                        updateWorkTypeRating(
                          workType.code,
                          currentRating === rating ? 0 : rating,
                        )
                      }
                    >
                      {rating <= currentRating ? "★" : "☆"}
                    </button>
                  );
                })}
              </div>
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
