import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";
import styles from "./WorkerEditableCells.module.css";

type EditableWorkerNameCellProps = {
  name: string;
  nickname?: string;
  onSave: (name: string, nickname: string) => Promise<void>;
};

type EditableTextCellProps = {
  ariaLabel: string;
  formatValue?: (value: string) => string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  value: string;
  onSave: (value: string) => Promise<void>;
};

export function EditableWorkerNameCell({
  name,
  nickname,
  onSave,
}: EditableWorkerNameCellProps) {
  const trimmedName = name.trim();
  const trimmedNickname = nickname?.trim() ?? "";
  const displayName = trimmedName || trimmedNickname || "-";
  const shouldShowNickname = Boolean(trimmedName && trimmedNickname);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftNickname, setDraftNickname] = useState(nickname ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const { anchorRef, popoverRef, popoverStyle } = useFloatingCellEditor(isEditing);

  const openEditor = () => {
    setDraftName(name);
    setDraftNickname(nickname ?? "");
    setIsEditing(true);
  };

  const closeEditor = () => {
    setIsEditing(false);
  };

  const saveEditor = async () => {
    if (!draftName.trim() && !draftNickname.trim()) {
      window.alert("이름 또는 호칭 중 하나를 입력해주세요.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave(draftName, draftNickname);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.editableCell}>
      <div className={styles.workerNameCell}>
        <span className={styles.workerLocalName}>{displayName}</span>
        {shouldShowNickname ? (
          <span className={styles.workerNickname}>- {trimmedNickname}</span>
        ) : null}
      </div>
      <EditButton buttonRef={anchorRef} label="이름 수정" onClick={openEditor} />

      {isEditing ? (
        <div className={styles.cellEditPopover} ref={popoverRef} style={popoverStyle}>
          <div className={styles.nameEditFields}>
            <input
              aria-label="이름"
              className={styles.cellEditInput}
              placeholder="이름"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <div className={styles.nicknameEditRow}>
              <span>-</span>
              <input
                aria-label="호칭"
                className={styles.cellEditInput}
                placeholder="호칭"
                value={draftNickname}
                onChange={(event) => setDraftNickname(event.target.value)}
              />
            </div>
          </div>
          <CellEditActions disabled={isSaving} onCancel={closeEditor} onSave={saveEditor} />
        </div>
      ) : null}
    </div>
  );
}

export function EditableTextCell({
  ariaLabel,
  formatValue,
  inputMode,
  maxLength,
  value,
  onSave,
}: EditableTextCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const { anchorRef, popoverRef, popoverStyle } = useFloatingCellEditor(isEditing);

  const openEditor = () => {
    setDraftValue(formatValue ? formatValue(value) : value);
    setIsEditing(true);
  };

  const closeEditor = () => {
    setIsEditing(false);
  };

  const saveEditor = async () => {
    setIsSaving(true);
    try {
      await onSave(draftValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.editableCell}>
      <span className={styles.editableCellText}>{value || "-"}</span>
      <EditButton buttonRef={anchorRef} label={`${ariaLabel} 수정`} onClick={openEditor} />

      {isEditing ? (
        <div className={styles.cellEditPopover} ref={popoverRef} style={popoverStyle}>
          <input
            aria-label={ariaLabel}
            className={styles.cellEditInput}
            inputMode={inputMode}
            maxLength={maxLength}
            value={draftValue}
            onChange={(event) =>
              setDraftValue(formatValue ? formatValue(event.target.value) : event.target.value)
            }
          />
          <CellEditActions disabled={isSaving} onCancel={closeEditor} onSave={saveEditor} />
        </div>
      ) : null}
    </div>
  );
}

function useFloatingCellEditor(isOpen: boolean): {
  anchorRef: RefObject<HTMLButtonElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
  popoverStyle: CSSProperties;
} {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverStyle({ visibility: "hidden" });
      return;
    }

    const updatePopoverPosition = () => {
      const anchorRect = anchorRef.current?.getBoundingClientRect();

      if (!anchorRect) {
        return;
      }

      const viewportPadding = 8;
      const popoverGap = 8;
      const popoverWidth = Math.min(320, window.innerWidth - viewportPadding * 2);
      const measuredHeight = popoverRef.current?.getBoundingClientRect().height ?? 96;
      const availableBelow = window.innerHeight - anchorRect.bottom - popoverGap - viewportPadding;
      const availableAbove = anchorRect.top - popoverGap - viewportPadding;
      const shouldOpenBelow = availableBelow >= measuredHeight || availableBelow >= availableAbove;
      const preferredTop = shouldOpenBelow
        ? anchorRect.bottom + popoverGap
        : anchorRect.top - popoverGap - measuredHeight;
      const top = Math.min(
        Math.max(viewportPadding, preferredTop),
        window.innerHeight - measuredHeight - viewportPadding,
      );
      const left = Math.min(
        Math.max(viewportPadding, anchorRect.right - popoverWidth),
        window.innerWidth - popoverWidth - viewportPadding,
      );

      setPopoverStyle({
        left,
        top,
        visibility: "visible",
        width: popoverWidth,
      });
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  return { anchorRef, popoverRef, popoverStyle };
}

function EditButton({
  buttonRef,
  label,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={styles.cellEditButton}
      ref={buttonRef}
      type="button"
      onClick={onClick}
    >
      ✎
    </button>
  );
}

function CellEditActions({
  disabled,
  onCancel,
  onSave,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className={styles.cellEditActions}>
      <button
        aria-label="저장"
        className={styles.cellEditConfirmButton}
        disabled={disabled}
        type="button"
        onClick={onSave}
      >
        ✓
      </button>
      <button
        aria-label="취소"
        className={styles.cellEditCancelButton}
        disabled={disabled}
        type="button"
        onClick={onCancel}
      >
        ×
      </button>
    </div>
  );
}
