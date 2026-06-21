import { useEffect, useState, type FormEvent } from "react";
import styles from "./App.module.css";

const sessionKey = "laborflow.demoSession";

const healthItems = [
  { label: "Web", value: "ready" },
  { label: "Backend Core", value: "/api/health" },
  { label: "Backend Fast", value: "/health" },
  { label: "Mobile", value: "debug build" },
];

const menuItems = ["인력 현황", "근태 관리", "일정 관리", "작업 일정"];

const socialLoginOptions = [
  { label: "Google로 로그인", className: styles.googleLoginButton },
  { label: "네이버로 로그인", className: styles.naverLoginButton },
  { label: "카카오톡으로 로그인", className: styles.kakaoLoginButton },
];

const profileMenuItems = [
  { label: "내 정보", path: "/profile" },
  { label: "결제", path: "/billing" },
  { label: "설정", path: "/settings" },
  { label: "알림", path: "/notifications" },
];

const servicePages: Record<string, { label: string; title: string; summary: string }> = {
  "/profile": {
    label: "프로필",
    title: "내 정보를 관리합니다.",
    summary: "인력사무소 계정 정보, 연락처, 보안 설정을 확인하고 수정하는 화면입니다.",
  },
  "/billing": {
    label: "결제",
    title: "결제와 이용 내역을 관리합니다.",
    summary: "요금제, 결제 수단, 청구 내역을 확인하는 서비스 영역입니다.",
  },
  "/settings": {
    label: "설정",
    title: "서비스 운영 설정을 조정합니다.",
    summary: "권한, 알림, 보안, 기본 작업 조건을 관리하는 화면입니다.",
  },
  "/notifications": {
    label: "알림",
    title: "중요 알림을 확인합니다.",
    summary: "근태, 작업 일정, 결제, 계정 보안 관련 알림을 모아보는 화면입니다.",
  },
};

type HeaderProps = {
  isLoggedIn: boolean;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

type LoginPageProps = {
  onLogin: () => void;
};

function Header({ isLoggedIn, onLogout, onNavigate }: HeaderProps) {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const handleNavigate = (path: string) => {
    setIsProfileMenuOpen(false);
    onNavigate(path);
  };

  return (
    <>
      <header className={styles.siteHeader}>
        <a
          className={styles.logoLink}
          href="/"
          aria-label="LaborFlow 메인 페이지"
          onClick={(event) => {
            event.preventDefault();
            handleNavigate("/");
          }}
        >
          LaborFlow
        </a>

        {isLoggedIn ? (
          <div className={styles.profileMenuContainer}>
            <button
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="menu"
              className={styles.profileMenuButton}
              type="button"
              onClick={() => setIsProfileMenuOpen((current) => !current)}
            >
              프로필
            </button>

            {isProfileMenuOpen ? (
              <div className={styles.profileDropdown} role="menu">
                {profileMenuItems.map((item) => (
                  <button
                    className={styles.profileDropdownItem}
                    key={item.path}
                    role="menuitem"
                    type="button"
                    onClick={() => handleNavigate(item.path)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  className={styles.profileDropdownItem}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onLogout();
                  }}
                >
                  로그아웃
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <nav className={styles.authLinks} aria-label="회원 메뉴">
            <a
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                handleNavigate("/login");
              }}
            >
              로그인
            </a>
            <a href="/signup">회원가입</a>
          </nav>
        )}
      </header>

      <nav className={styles.menuBar} aria-label="주요 메뉴">
        {menuItems.map((menuItem) => (
          <button className={styles.menuButton} type="button" key={menuItem}>
            {menuItem}
          </button>
        ))}
      </nav>
    </>
  );
}

function LoginPage({ onLogin }: LoginPageProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin();
  };

  return (
    <main className={styles.loginMainContent}>
      <section className={styles.loginPanel} aria-labelledby="login-title">
        <div className={styles.loginHeading}>
          <p className={styles.sectionLabel}>계정 로그인</p>
          <h1 id="login-title">LaborFlow에 로그인</h1>
        </div>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <label className={styles.formField}>
            <span>아이디</span>
            <input
              autoComplete="username"
              name="loginId"
              placeholder="아이디를 입력하세요"
              type="text"
            />
          </label>

          <label className={styles.formField}>
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              name="password"
              placeholder="비밀번호를 입력하세요"
              type="password"
            />
          </label>

          <div className={styles.loginOptionsRow}>
            <label className={styles.rememberLogin}>
              <input name="rememberLogin" type="checkbox" />
              <span>로그인 유지</span>
            </label>
            <a href="/password-reset">비밀번호 찾기</a>
          </div>

          <button className={styles.primaryLoginButton} type="submit">
            로그인
          </button>
        </form>

        <div className={styles.loginDivider} aria-hidden="true">
          <span />
          <p>또는</p>
          <span />
        </div>

        <div className={styles.socialLoginList} aria-label="소셜 로그인">
          {socialLoginOptions.map((option) => (
            <button
              className={`${styles.socialLoginButton} ${option.className}`}
              type="button"
              key={option.label}
              onClick={onLogin}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function HomePage() {
  return (
    <main className={styles.mainContent}>
      <section className={styles.statusPanel} aria-labelledby="laborflow-title">
        <p className={styles.sectionLabel}>운영 준비</p>
        <h1 id="laborflow-title">인력 운영 흐름을 준비 중입니다.</h1>
        <p className={styles.summaryText}>
          현재 골격은 인력 관리, 근태, 일정, 업무 흐름을 위한 기본 화면과
          health check 연결 지점만 제공합니다.
        </p>
        <dl className={styles.healthGrid}>
          {healthItems.map((item) => (
            <div className={styles.healthCard} key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

function ServicePage({ path }: { path: string }) {
  const page = servicePages[path] ?? servicePages["/profile"];

  return (
    <main className={styles.mainContent}>
      <section className={styles.servicePanel} aria-labelledby="service-title">
        <p className={styles.sectionLabel}>{page.label}</p>
        <h1 id="service-title">{page.title}</h1>
        <p className={styles.summaryText}>{page.summary}</p>
      </section>
    </main>
  );
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => window.localStorage.getItem(sessionKey) === "active",
  );

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState(null, "", path);
    setCurrentPath(path);
  };

  const handleLogin = () => {
    window.localStorage.setItem(sessionKey, "active");
    setIsLoggedIn(true);
    navigateTo("/");
  };

  const handleLogout = () => {
    window.localStorage.removeItem(sessionKey);
    setIsLoggedIn(false);
    navigateTo("/login");
  };

  const isProtectedServicePath = Object.hasOwn(servicePages, currentPath);
  const shouldShowLoginPage =
    !isLoggedIn && (currentPath === "/login" || isProtectedServicePath);
  const isServicePage = isLoggedIn && isProtectedServicePath;

  return (
    <div className={styles.page}>
      <Header
        isLoggedIn={isLoggedIn}
        onLogout={handleLogout}
        onNavigate={navigateTo}
      />
      {shouldShowLoginPage ? (
        <LoginPage onLogin={handleLogin} />
      ) : isServicePage ? (
        <ServicePage path={currentPath} />
      ) : (
        <HomePage />
      )}
    </div>
  );
}
