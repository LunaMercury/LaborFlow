import { useEffect, useState } from "react";
import {
  fetchWorkers,
  fetchWorkTypes,
  updateWorkerIdentity as saveWorkerIdentity,
  updateWorkerPhone as saveWorkerPhone,
  updateWorkerPickupLocation as saveWorkerPickupLocation,
  updateWorkerWorkTypes as saveWorkerWorkTypes,
} from "../api/workforceApi";
import styles from "../App.module.css";
import { EditableTextCell, EditableWorkerNameCell } from "../components/WorkerEditableCells";
import { WorkerRegistrationModal } from "../components/WorkerRegistrationModal";
import { WorkerWorkTypeCell } from "../components/WorkerWorkTypeCell";
import { workTypeOptions as fallbackWorkTypeOptions } from "../data/workTypeOptions";
import { workerRows } from "../data/workerRows";
import { formatKoreanPhoneNumber } from "../utils/phoneNumber";

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

  const updateWorkerIdentity = async (workerIndex: number, name: string, nickname: string) => {
    const worker = workers[workerIndex];
    if (!worker.profileUuid) {
      setWorkers((currentWorkers) =>
        currentWorkers.map((currentWorker, index) =>
          index === workerIndex ? { ...currentWorker, name, nickname } : currentWorker,
        ),
      );
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      setWorkers(await saveWorkerIdentity(loginId, worker.profileUuid, name, nickname));
      setStatusMessage("이름 정보를 DB에 저장했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "이름 정보를 저장하지 못했습니다.");
      throw error;
    }
  };

  const updateWorkerPhone = async (workerIndex: number, phone: string) => {
    const worker = workers[workerIndex];
    if (!worker.profileUuid) {
      setWorkers((currentWorkers) =>
        currentWorkers.map((currentWorker, index) =>
          index === workerIndex ? { ...currentWorker, phone } : currentWorker,
        ),
      );
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      setWorkers(await saveWorkerPhone(loginId, worker.profileUuid, phone));
      setStatusMessage("전화번호를 DB에 저장했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "전화번호를 저장하지 못했습니다.");
      throw error;
    }
  };

  const updateWorkerPickupLocation = async (workerIndex: number, pickupLocation: string) => {
    const worker = workers[workerIndex];
    if (!worker.profileUuid) {
      setWorkers((currentWorkers) =>
        currentWorkers.map((currentWorker, index) =>
          index === workerIndex ? { ...currentWorker, pickupLocation } : currentWorker,
        ),
      );
      setStatusMessage("DB 작업자 프로필이 없어 화면에만 반영했습니다.");
      return;
    }

    try {
      setWorkers(await saveWorkerPickupLocation(loginId, worker.profileUuid, pickupLocation));
      setStatusMessage("승차장소를 DB에 저장했습니다.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "승차장소를 저장하지 못했습니다.");
      throw error;
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
                    <EditableWorkerNameCell
                      name={worker.name}
                      nickname={worker.nickname}
                      onSave={(name, nickname) =>
                        updateWorkerIdentity(workerIndex, name, nickname)
                      }
                    />
                  </td>
                  <td>
                    <EditableTextCell
                      ariaLabel="전화번호"
                      formatValue={formatKoreanPhoneNumber}
                      inputMode="numeric"
                      maxLength={13}
                      value={worker.phone}
                      onSave={(phone) => updateWorkerPhone(workerIndex, phone)}
                    />
                  </td>
                  <td className={styles.workTypeTableCell}>
                    <WorkerWorkTypeCell
                      selectedCodes={worker.workTypeCodes}
                      workTypeOptions={workTypes}
                      onChange={(nextWorkTypeCodes) =>
                        updateWorkerWorkTypes(workerIndex, nextWorkTypeCodes)
                      }
                    />
                  </td>
                  <td>
                    <EditableTextCell
                      ariaLabel="승차장소"
                      value={worker.pickupLocation}
                      onSave={(pickupLocation) =>
                        updateWorkerPickupLocation(workerIndex, pickupLocation)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {isRegistrationModalOpen ? (
        <WorkerRegistrationModal
          loginId={loginId}
          onClose={() => setIsRegistrationModalOpen(false)}
          onRegistered={(nextWorkers) => {
            setWorkers(nextWorkers);
            setStatusMessage("작업자를 DB에 등록했습니다.");
          }}
        />
      ) : null}
    </main>
  );
}
