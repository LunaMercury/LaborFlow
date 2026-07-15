import { useEffect, useRef } from "react";
import styles from "./StatusSnackbar.module.css";

type StatusSnackbarProps = {
  message: string;
  onDismiss: () => void;
};

export function StatusSnackbar({ message, onDismiss }: StatusSnackbarProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timerId = window.setTimeout(() => onDismissRef.current(), 3200);
    return () => window.clearTimeout(timerId);
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <div className={styles.snackbar} role="status">
      <span>{message}</span>
      <button aria-label="알림 닫기" type="button" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
