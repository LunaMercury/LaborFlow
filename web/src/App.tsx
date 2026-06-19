import styles from "./App.module.css";

const healthItems = [
  { label: "Web", value: "ready" },
  { label: "Backend Core", value: "/api/health" },
  { label: "Backend Fast", value: "/health" },
  { label: "Mobile", value: "debug build" },
];

const menuItems = ["인력 현황", "근태 관리", "일정 관리", "영업일지"];

export default function App() {
  return (
    <div className={styles.page}>
      <header className={styles.siteHeader}>
        <a
          className={styles.logoLink}
          href="/"
          aria-label="LaborFlow 메인 페이지"
        >
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

      <main className={styles.mainContent}>
        <section
          className={styles.statusPanel}
          aria-labelledby="laborflow-title"
        >
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
    </div>
  );
}
