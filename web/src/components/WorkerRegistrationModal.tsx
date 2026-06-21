import { useState, type FormEvent } from "react";
import styles from "../App.module.css";
import { workTypeOptions } from "../data/workTypeOptions";

type WorkerRegistrationModalProps = {
  onClose: () => void;
};

export function WorkerRegistrationModal({ onClose }: WorkerRegistrationModalProps) {
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(workTypeOptions.map((workType) => [workType.code, 0])),
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="worker-registration-title"
        aria-modal="true"
        className={styles.workerRegistrationModal}
        role="dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.sectionLabel}>인력 등록</p>
            <h2 id="worker-registration-title">작업자 정보 입력</h2>
          </div>
          <button
            aria-label="인력 등록 닫기"
            className={styles.modalCloseButton}
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className={styles.workerRegistrationForm} onSubmit={handleSubmit}>
          <div className={styles.workerFormGrid}>
            <label className={styles.formField}>
              <span>이름</span>
              <input name="workerName" placeholder="이름을 입력하세요" type="text" />
            </label>

            <label className={styles.formField}>
              <span>전화번호</span>
              <input name="workerPhone" placeholder="010-0000-0000" type="tel" />
            </label>

            <label className={styles.formField}>
              <span>승차장소</span>
              <input name="pickupLocation" placeholder="승차장소를 입력하세요" type="text" />
            </label>
          </div>

          <div className={styles.workSkillSection}>
            <div className={styles.workSkillHeader}>
              <h3>작업 능력</h3>
              <p>작업별 별점을 0~3개로 선택합니다.</p>
            </div>

            <div className={styles.workSkillList}>
              {workTypeOptions.map((workType) => (
                <div className={styles.workSkillRow} key={workType.code}>
                  <span>{workType.name}</span>
                  <div className={styles.ratingButtonGroup} aria-label={`${workType.name} 별점`}>
                    {[0, 1, 2, 3].map((rating) => (
                      <button
                        aria-pressed={ratings[workType.code] === rating}
                        className={`${styles.ratingButton} ${
                          ratings[workType.code] === rating ? styles.activeRatingButton : ""
                        }`}
                        key={rating}
                        type="button"
                        onClick={() =>
                          setRatings((current) => ({
                            ...current,
                            [workType.code]: rating,
                          }))
                        }
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.modalActions}>
            <button className={styles.secondaryActionButton} type="button" onClick={onClose}>
              취소
            </button>
            <button className={styles.primaryActionButton} type="submit">
              등록
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
