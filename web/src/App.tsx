import styles from "./App.module.css";

const healthItems = [
  { label: "Web", value: "ready" },
  { label: "Backend Core", value: "/api/health" },
  { label: "Backend Fast", value: "/health" },
  { label: "Mobile", value: "debug build" },
];

export default function App() {
  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="laborflow-title">
        <p className={styles.eyebrow}>LaborFlow</p>
        <h1 id="laborflow-title">인력 운영 흐름을 준비 중입니다.</h1>
        <p className={styles.summary}>
          현재 골격은 인력 관리, 근태, 일정, 업무 흐름을 위한 기본 화면과
          health check 연결 지점만 제공합니다.
        </p>
        <dl className={styles.healthGrid}>
          {healthItems.map((item) => (
            <div className={styles.healthItem} key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
