import styles from "../App.module.css";
import { healthItems } from "../data/healthItems";

export function HomePage() {
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
