import styles from "./App.module.css";

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

function Header() {
  return (
    <>
      <header className={styles.siteHeader}>
        <a className={styles.logoLink} href="/" aria-label="LaborFlow 메인 페이지">
          LaborFlow
        </a>
        <nav className={styles.authLinks} aria-label="회원 메뉴">
          <a href="/login">로그인</a>
          <a href="/signup">회원가입</a>
        </nav>
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

function LoginPage() {
  return (
    <main className={styles.loginMainContent}>
      <section className={styles.loginPanel} aria-labelledby="login-title">
        <div className={styles.loginHeading}>
          <p className={styles.sectionLabel}>계정 로그인</p>
          <h1 id="login-title">LaborFlow에 로그인</h1>
        </div>

        <form
          className={styles.loginForm}
          onSubmit={(event) => event.preventDefault()}
        >
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

export default function App() {
  const isLoginPage = window.location.pathname === "/login";

  return (
    <div className={styles.page}>
      <Header />
      {isLoginPage ? <LoginPage /> : <HomePage />}
    </div>
  );
}
