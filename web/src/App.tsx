import { useEffect, useState, type FormEvent } from "react";
import styles from "./App.module.css";

const sessionKey = "laborflow.demoSession";
const standardSessionDurationMs = 12 * 60 * 60 * 1000;
const rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000;

const healthItems = [
  { label: "Web", value: "ready" },
  { label: "Backend Core", value: "/api/health" },
  { label: "Backend Fast", value: "/health" },
  { label: "Mobile", value: "debug build" },
];

const menuItems = [
  { label: "인력 현황", path: "/workers" },
  { label: "근태 관리", path: "/attendance" },
  { label: "일정 관리", path: "/schedule" },
  { label: "작업 일정", path: "/work-schedule" },
];

const workerRows = [
  {
    name: "홍길순",
    phone: "010-1234-5678",
    availableWork: "마늘 수확, 선별",
    pickupLocation: "남부 정류장",
  },
  {
    name: "앞산 아줌마",
    phone: "010-1234-5678",
    availableWork: "양파 포장",
    pickupLocation: "앞산 입구",
  },
  {
    name: "김철수",
    phone: "010-9876-5432",
    availableWork: "상하차, 운반",
    pickupLocation: "동문 주차장",
  },
  {
    name: "박영희",
    phone: "010-2468-1357",
    availableWork: "수확 보조",
    pickupLocation: "중앙시장",
  },
];

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
  "/attendance": {
    label: "근태 관리",
    title: "근태 흐름을 관리합니다.",
    summary: "출근, 퇴근, 결근, 조퇴 상태를 확인하고 확정하는 화면입니다.",
  },
  "/schedule": {
    label: "일정 관리",
    title: "현장 일정을 관리합니다.",
    summary: "농장별 작업 일정과 필요 인원을 배정하는 화면입니다.",
  },
  "/work-schedule": {
    label: "작업 일정",
    title: "작업별 배정을 확인합니다.",
    summary: "작업 내용, 현장, 이동 흐름을 기준으로 배정 상태를 확인하는 화면입니다.",
  },
};

type DemoSession = {
  status: "active";
  rememberLogin: boolean;
  issuedAt: string;
  expiresAt: string;
};

type HeaderProps = {
  currentPath: string;
  isLoggedIn: boolean;
  onLogout: () => void;
  onNavigate: (path: string) => void;
};

type LoginPageProps = {
  onLogin: (rememberLogin: boolean) => void;
};

function createDemoSession(rememberLogin: boolean): DemoSession {
  const now = Date.now();
  const duration = rememberLogin
    ? rememberedSessionDurationMs
    : standardSessionDurationMs;

  return {
    status: "active",
    rememberLogin,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + duration).toISOString(),
  };
}

function readDemoSession(): DemoSession | null {
  const rawSession = window.localStorage.getItem(sessionKey);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as DemoSession;
    const expiresAt = Date.parse(session.expiresAt);

    if (session.status !== "active" || Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(sessionKey);
      return null;
    }

    return session;
  } catch {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
}

function Header({ currentPath, isLoggedIn, onLogout, onNavigate }: HeaderProps) {
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
          <button
            aria-current={currentPath === menuItem.path ? "page" : undefined}
            className={`${styles.menuButton} ${
              currentPath === menuItem.path ? styles.activeMenuButton : ""
            }`}
            type="button"
            key={menuItem.path}
            onClick={() => handleNavigate(menuItem.path)}
          >
            {menuItem.label}
          </button>
        ))}
      </nav>
    </>
  );
}

function LoginPage({ onLogin }: LoginPageProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onLogin(formData.get("rememberLogin") === "on");
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
              onClick={() => onLogin(true)}
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

function WorkersPage() {
  return (
    <main className={styles.tableMainContent}>
      <section className={styles.workersPanel} aria-labelledby="workers-title">
        <div className={styles.workersPageHeader}>
          <div className={styles.workersHeading}>
            <p className={styles.sectionLabel}>인력 현황</p>
            <h1 id="workers-title">작업자 목록</h1>
          </div>
          <div className={styles.workerCountBadge}>
            <span>{workerRows.length}</span>
            <p>등록 인력</p>
          </div>
        </div>

        <div className={styles.workerTableFrame}>
          <table className={styles.workerTable}>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">전화번호</th>
                <th scope="col">가능한 작업</th>
                <th scope="col">승차장소</th>
              </tr>
            </thead>
            <tbody>
              {workerRows.map((worker) => (
                <tr key={`${worker.name}-${worker.pickupLocation}`}>
                  <td>{worker.name}</td>
                  <td>{worker.phone}</td>
                  <td>{worker.availableWork}</td>
                  <td>{worker.pickupLocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    window.localStorage.setItem(
      sessionKey,
      JSON.stringify(createDemoSession(rememberLogin)),
    );
    setIsLoggedIn(true);
    navigateTo(currentPath === "/login" ? "/" : currentPath);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(sessionKey);
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
