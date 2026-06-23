import { useEffect, useState } from "react";
import {
  fetchWorkers,
  fetchWorkTypes,
  updateWorkerWorkTypes as saveWorkerWorkTypes,
} from "../api/workforceApi";
import styles from "../App.module.css";
import { WorkerRegistrationModal } from "../components/WorkerRegistrationModal";
import { WorkerWorkTypeCell } from "../components/WorkerWorkTypeCell";
import { workTypeOptions as fallbackWorkTypeOptions } from "../data/workTypeOptions";
import { workerRows } from "../data/workerRows";

type WorkersPageProps = {
  loginId: string;
};

export function WorkersPage({ loginId }: WorkersPageProps) {
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [workers, setWorkers] = useState(workerRows);
  const [workTypes, setWorkTypes] = useState(fallbackWorkTypeOptions);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchWorkers(loginId), fetchWorkTypes()])
      .then(([nextWorkers, nextWorkTypes]) => {
        if (!isMounted) {
          return;
        }

        setWorkers(nextWorkers);
        setWorkTypes(nextWorkTypes);
        setStatusMessage("");
      })
      .catch(() => {
        if (isMounted) {
          setStatusMessage("DB 데이터를 불러오지 못해 임시 목록을 표시합니다.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [loginId]);

  const updateWorkerWorkTypes = async (workerIndex: number, nextWorkTypeCodes: string[]) => {
    const worker = workers[workerIndex];
    const previousWorkers = workers;

    setWorkers((currentWorkers) =>
      currentWorkers.map((worker, index) =>
        index === workerIndex ? { ...worker, workTypeCodes: nextWorkTypeCodes } : worker,
      ),
    );

    if (!worker.profileUuid) {
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      const savedWorkers = await saveWorkerWorkTypes(
        loginId,
        worker.profileUuid,
        nextWorkTypeCodes,
      );
      setWorkers(savedWorkers);
      setStatusMessage("가능한 작업을 DB에 저장했습니다.");
    } catch {
      setWorkers(previousWorkers);
      setStatusMessage("가능한 작업 저장에 실패했습니다.");
    }
  };

  return (
    <main className={styles.tableMainContent}>
      <section className={styles.workersPanel} aria-labelledby="workers-title">
        <div className={styles.workersPageHeader}>
          <div className={styles.workersHeading}>
            <div className={styles.workersMetaRow}>
              <p className={styles.sectionLabel}>인력 현황</p>
              <span className={styles.workersCountText}>
                등록 인력 : {workers.length} 명
              </span>
            </div>
            <h1 id="workers-title">작업자 목록</h1>
            {statusMessage ? (
              <p className={styles.workersStatusMessage}>{statusMessage}</p>
            ) : null}
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
              {workers.map((worker, workerIndex) => (
                <tr key={worker.profileUuid ?? `${worker.name}-${worker.phone}-${workerIndex}`}>
                  <td>
                    <div className={styles.workerNameCell}>
                      <span className={styles.workerLocalName}>{worker.name}</span>
                      {worker.nickname ? (
                        <span className={styles.workerNickname}>- {worker.nickname}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>{worker.phone}</td>
                  <td className={styles.workTypeTableCell}>
                    <WorkerWorkTypeCell
                      selectedCodes={worker.workTypeCodes}
                      workTypeOptions={workTypes}
                      onChange={(nextWorkTypeCodes) =>
                        updateWorkerWorkTypes(workerIndex, nextWorkTypeCodes)
                      }
                    />
                  </td>
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
