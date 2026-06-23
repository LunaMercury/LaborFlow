import { useState, type FormEvent } from "react";
import styles from "../App.module.css";
import { workTypeOptions } from "../data/workTypeOptions";

type WorkerRegistrationModalProps = {
  onClose: () => void;
};

type GenderValue = "M" | "F" | "N";

export function WorkerRegistrationModal({
  onClose,
}: WorkerRegistrationModalProps) {
  const registrationFormId = "worker-registration-form";
  const [gender, setGender] = useState<GenderValue>("N");
  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(workTypeOptions.map((workType) => [workType.code, 0])),
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onClose();
  };

  const toggleGender = (nextGender: Exclude<GenderValue, "N">) => {
    setGender((currentGender) =>
      currentGender === nextGender ? "N" : nextGender,
    );
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
          <div className={styles.modalHeaderActions}>
            <button
              className={styles.primaryActionButton}
              form={registrationFormId}
              type="submit"
            >
              등록
            </button>
            <button
              className={styles.secondaryActionButton}
              type="button"
              onClick={onClose}
            >
              취소
            </button>
          </div>
        </div>

        <div className={styles.modalScrollArea}>
          <form
            className={styles.workerRegistrationForm}
            id={registrationFormId}
            onSubmit={handleSubmit}
          >
            <div className={styles.workerFormGrid}>
              <label className={styles.formField}>
                <span>
                  호칭 <strong className={styles.requiredMark}>*</strong>
                </span>
                <input
                  name="localName"
                  placeholder="호칭을 입력하세요"
                  required
                  type="text"
                />
              </label>

              <label className={styles.formField}>
                <span>이름</span>
                <input
                  name="workerName"
                  placeholder="실명을 입력하세요"
                  type="text"
                />
              </label>

              <label className={styles.formField}>
                <span>
                  전화번호 <strong className={styles.requiredMark}>*</strong>
                </span>
                <input
                  name="workerPhone"
                  placeholder="010-0000-0000"
                  required
                  type="tel"
                />
              </label>

              <label className={styles.formField}>
                <span>나이</span>
                <input
                  max="150"
                  min="0"
                  name="age"
                  placeholder="나이"
                  type="number"
                />
              </label>

              <label className={styles.formField}>
                <span>승차장소</span>
                <input
                  name="pickupLocation"
                  placeholder="승차장소를 입력하세요"
                  type="text"
                />
              </label>

              <div className={styles.formField}>
                <span>성별</span>
                <input name="gender" type="hidden" value={gender} />
                <div className={styles.genderButtonGroup} aria-label="성별 선택">
                  <button
                    aria-pressed={gender === "M"}
                    className={`${styles.genderButton} ${
                      gender === "M" ? styles.activeGenderButton : ""
                    }`}
                    type="button"
                    onClick={() => toggleGender("M")}
                  >
                    남
                  </button>
                  <button
                    aria-pressed={gender === "F"}
                    className={`${styles.genderButton} ${
                      gender === "F" ? styles.activeGenderButton : ""
                    }`}
                    type="button"
                    onClick={() => toggleGender("F")}
                  >
                    여
                  </button>
                </div>
              </div>

              <label className={`${styles.formField} ${styles.fullWidthField}`}>
                <span>메모</span>
                <textarea
                  name="memo"
                  placeholder="작업자 메모를 입력하세요"
                  rows={3}
                />
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
                    <div
                      className={styles.ratingButtonGroup}
                      aria-label={`${workType.name} 별점`}
                    >
                      {[0, 1, 2, 3].map((rating) => (
                        <button
                          aria-pressed={ratings[workType.code] === rating}
                          className={`${styles.ratingButton} ${
                            ratings[workType.code] === rating
                              ? styles.activeRatingButton
                              : ""
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
          </form>
        </div>
      </section>
    </div>
  );
}
