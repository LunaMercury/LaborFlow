import { useState } from "react";
import styles from "../App.module.css";
import { WorkerRegistrationModal } from "../components/WorkerRegistrationModal";
import { workerRows } from "../data/workerRows";

export function WorkersPage() {
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);

  return (
    <main className={styles.tableMainContent}>
      <section className={styles.workersPanel} aria-labelledby="workers-title">
        <div className={styles.workersPageHeader}>
          <div className={styles.workersHeading}>
            <div className={styles.workersMetaRow}>
              <p className={styles.sectionLabel}>인력 현황</p>
              <span className={styles.workersCountText}>
                등록 인력 : {workerRows.length} 명
              </span>
            </div>
            <h1 id="workers-title">작업자 목록</h1>
          </div>
          <button
            className={styles.registerWorkerButton}
            type="button"
            onClick={() => setIsRegistrationModalOpen(true)}
          >
            인력 등록 +
          </button>
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
      {isRegistrationModalOpen ? (
        <WorkerRegistrationModal onClose={() => setIsRegistrationModalOpen(false)} />
      ) : null}
    </main>
  );
}
