import { useEffect, useRef, useState } from "react";
import styles from "./App.module.css";
import { Header } from "./components/Header";
import { servicePages } from "./data/servicePages";
import { ClientsPage } from "./pages/ClientsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { FormsPage } from "./pages/FormsPage";
import { HomePage } from "./pages/HomePage";
import { SalesJournalPage } from "./pages/SalesJournalPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ScheduleCalendarPage } from "./pages/ScheduleCalendarPage";
import { ServicePage } from "./pages/ServicePage";
import { TeamsPage } from "./pages/TeamsPage";
import { WorkersPage } from "./pages/WorkersPage";
import { WorkSchedulePage } from "./pages/WorkSchedulePage";
import { WorkJournalPage } from "./pages/WorkJournalPage";
import { BEFORE_APP_NAVIGATE_EVENT } from "./hooks/useUnsavedChangesGuard";
import {
  clearDemoSession,
  readDemoSession,
  saveDemoSession,
} from "./session/demoSession";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const currentUrlRef = useRef(`${window.location.pathname}${window.location.search}`);
  const [isLoggedIn, setIsLoggedIn] = useState(() => readDemoSession() !== null);

  useEffect(() => {
    const handlePopState = () => {
      const navigationEvent = new Event(BEFORE_APP_NAVIGATE_EVENT, {
        cancelable: true,
      });
      if (!window.dispatchEvent(navigationEvent)) {
        window.history.pushState(null, "", currentUrlRef.current);
        return;
      }
      currentUrlRef.current = `${window.location.pathname}${window.location.search}`;
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (readDemoSession() === null) {
        setIsLoggedIn(false);
      }
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const navigateTo = (path: string) => {
    const navigationEvent = new Event(BEFORE_APP_NAVIGATE_EVENT, {
      cancelable: true,
    });
    if (!window.dispatchEvent(navigationEvent)) {
      return;
    }
    window.history.pushState(null, "", path);
    currentUrlRef.current = path;
    setCurrentPath(window.location.pathname);
  };

  const handleLogin = (rememberLogin: boolean, loginId: string) => {
    saveDemoSession(rememberLogin, loginId);
    setIsLoggedIn(true);
    navigateTo(currentPath === "/login" ? "/" : currentUrlRef.current);
  };

  const handleLogout = () => {
    clearDemoSession();
    setIsLoggedIn(false);
    navigateTo("/login");
  };

  const isProtectedServicePath = Object.hasOwn(servicePages, currentPath);
  const isWorkersPage = currentPath === "/workers";
  const isClientsPage = currentPath === "/clients";
  const isAttendancePage = currentPath === "/attendance";
  const isTeamsPage = currentPath === "/teams" || currentPath === "/team";
  const isSchedulePage = currentPath === "/schedule";
  const isWorkSchedulePage = currentPath === "/work-schedule";
  const isFormsPage = currentPath === "/forms";
  const isSalesJournalPage = currentPath === "/sales-journals";
  const isWorkJournalPage = currentPath === "/work-journals";
  const isProfilePage = currentPath === "/profile";
  const shouldShowLoginPage =
    !isLoggedIn && (
      currentPath === "/login" ||
      isProtectedServicePath ||
      isWorkersPage ||
      isClientsPage ||
      isAttendancePage ||
      isTeamsPage ||
      isSchedulePage ||
      isWorkSchedulePage ||
      isFormsPage ||
      isSalesJournalPage ||
      isWorkJournalPage ||
      isProfilePage
    );
  const isServicePage = isLoggedIn && isProtectedServicePath;

  return (
    <div className={styles.page}>
      <Header
        currentPath={currentPath}
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
        onNavigate={navigateTo}
      />
      {shouldShowLoginPage ? (
        <LoginPage onLogin={handleLogin} />
      ) : isLoggedIn && isWorkersPage ? (
        <WorkersPage
          loginId={readDemoSession()?.loginId ?? "test"}
          onNavigate={navigateTo}
        />
      ) : isLoggedIn && isClientsPage ? (
        <ClientsPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isAttendancePage ? (
        <AttendancePage
          loginId={readDemoSession()?.loginId ?? "test"}
          onNavigate={navigateTo}
        />
      ) : isLoggedIn && isTeamsPage ? (
        <TeamsPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isSchedulePage ? (
        <ScheduleCalendarPage
          loginId={readDemoSession()?.loginId ?? "test"}
          onNavigate={navigateTo}
        />
      ) : isLoggedIn && isWorkSchedulePage ? (
        <WorkSchedulePage
          loginId={readDemoSession()?.loginId ?? "test"}
          onNavigate={navigateTo}
        />
      ) : isLoggedIn && isFormsPage ? (
        <FormsPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isSalesJournalPage ? (
        <SalesJournalPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isWorkJournalPage ? (
        <WorkJournalPage
          loginId={readDemoSession()?.loginId ?? "test"}
          onNavigate={navigateTo}
        />
      ) : isLoggedIn && isProfilePage ? (
        <ProfilePage
          loginId={readDemoSession()?.loginId ?? "test"}
          onAccountWithdrawn={handleLogout}
        />
      ) : isServicePage ? (
        <ServicePage path={currentPath} />
      ) : (
        <HomePage />
      )}
    </div>
  );
}
