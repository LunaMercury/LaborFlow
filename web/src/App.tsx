import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { Header } from "./components/Header";
import { servicePages } from "./data/servicePages";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { ServicePage } from "./pages/ServicePage";
import { WorkersPage } from "./pages/WorkersPage";
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

  const handleLogin = (rememberLogin: boolean) => {
    saveDemoSession(rememberLogin);
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
  const shouldShowLoginPage =
    !isLoggedIn && (currentPath === "/login" || isProtectedServicePath || isWorkersPage);
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
        <WorkersPage />
      ) : isServicePage ? (
        <ServicePage path={currentPath} />
      ) : (
        <HomePage />
      )}
    </div>
  );
}
