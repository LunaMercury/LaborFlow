import { useEffect, useRef } from "react";

export const BEFORE_APP_NAVIGATE_EVENT = "laborflow:before-navigate";

export function useUnsavedChangesGuard(
  isDirty: boolean,
  message = "저장하지 않은 내용이 있습니다. 페이지를 이동할까요?",
) {
  const dirtyRef = useRef(isDirty);
  const messageRef = useRef(message);

  useEffect(() => {
    dirtyRef.current = isDirty;
    messageRef.current = message;
  }, [isDirty, message]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    const handleAppNavigation = (event: Event) => {
      if (dirtyRef.current && !window.confirm(messageRef.current)) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener(BEFORE_APP_NAVIGATE_EVENT, handleAppNavigation);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener(BEFORE_APP_NAVIGATE_EVENT, handleAppNavigation);
    };
  }, []);

  return () => !dirtyRef.current || window.confirm(messageRef.current);
}
