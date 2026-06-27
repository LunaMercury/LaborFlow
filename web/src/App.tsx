import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { Header } from "./components/Header";
import { servicePages } from "./data/servicePages";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
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
  const isTeamsPage = currentPath === "/teams";
  const isWorkSchedulePage = currentPath === "/work-schedule";
  const shouldShowLoginPage =
    !isLoggedIn && (
      currentPath === "/login" ||
      isProtectedServicePath ||
      isWorkersPage ||
      isTeamsPage ||
      isWorkSchedulePage
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
      ) : isLoggedIn && isTeamsPage ? (
        <TeamsPage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isLoggedIn && isWorkSchedulePage ? (
        <WorkSchedulePage loginId={readDemoSession()?.loginId ?? "test"} />
      ) : isServicePage ? (
        <ServicePage path={currentPath} />
      ) : (
        <HomePage />
      )}
    </div>
  );
}
