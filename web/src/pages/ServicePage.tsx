import styles from "../App.module.css";
import { servicePages } from "../data/servicePages";

type ServicePageProps = {
  path: string;
};

export function ServicePage({ path }: ServicePageProps) {
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
