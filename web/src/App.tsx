import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { Header } from "./components/Header";
import { servicePages } from "./data/servicePages";
import { ClientsPage } from "./pages/ClientsPage";
import { AttendancePage } from "./pages/AttendancePage";
import { FormsPage } from "./pages/FormsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ScheduleCalendarPage } from "./pages/ScheduleCalendarPage";
import { ServicePage } from "./pages/ServicePage";
import { TeamsPage } from "./pages/TeamsPage";
import { WorkersPage } from "./pages/WorkersPage";
import { WorkSchedulePage } from "./pages/WorkSchedulePage";
import {
  clearDemoSession,
  readDemoSession,
  saveDemoSession,
} from "./session/demoSession";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isLoggedIn, setIsLoggedIn] = useState(() => readDemoSession() !== null);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
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
    window.history.pushState(null, "", path);
    setCurrentPath(path);
  };

  const handleLogin = (rememberLogin: boolean, loginId: string) => {
    saveDemoSession(rememberLogin, loginId);
    setIsLoggedIn(true);
    navigateTo(currentPath === "/login" ? "/" : currentPath);
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
        <AttendancePage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isTeamsPage ? (
        <TeamsPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isSchedulePage ? (
        <ScheduleCalendarPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isWorkSchedulePage ? (
        <WorkSchedulePage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isFormsPage ? (
        <FormsPage loginId={readDemoSession()?.loginId ?? "test"} />
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
