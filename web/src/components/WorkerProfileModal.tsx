import { useState, type FormEvent } from "react";
import {
  createWorker,
  updateWorkerProfile,
} from "../api/workforceApi";
import type { WorkTypeOption } from "../data/workTypeOptions";
import type { WorkerRow } from "../data/workerRows";
import { formatKoreanPhoneNumber, getPhoneDigits } from "../utils/phoneNumber";
import { WorkerWorkTypeCell } from "./WorkerWorkTypeCell";
import styles from "./WorkerProfileModal.module.css";

type WorkerProfileModalMode = "create" | "edit";

type WorkerProfileModalProps = {
  loginId: string;
  mode: WorkerProfileModalMode;
  worker?: WorkerRow;
  workTypeOptions: WorkTypeOption[];
  onClose: () => void;
  onSaved: (workers: WorkerRow[]) => void;
};

type GenderValue = "M" | "F" | "N";

const EVERY_DAY_MASK = 127;
const WEEKDAY_MASK = 31;
const WEEKEND_MASK = 96;

const weekdayOptions = [
  { bit: 1, label: "월" },
  { bit: 2, label: "화" },
  { bit: 4, label: "수" },
  { bit: 8, label: "목" },
  { bit: 16, label: "금" },
  { bit: 32, label: "토" },
  { bit: 64, label: "일" },
];

function toFormGender(gender?: string): GenderValue {
  if (gender === "MALE" || gender === "M") {
    return "M";
  }

  if (gender === "FEMALE" || gender === "F") {
    return "F";
  }

  return "N";
}

export function WorkerProfileModal({
  loginId,
  mode,
  worker,
  workTypeOptions,
  onClose,
  onSaved,
}: WorkerProfileModalProps) {
  const formId = `worker-profile-${mode}-form`;
  const isEditMode = mode === "edit";
  const [localNickname, setLocalNickname] = useState(worker?.nickname ?? "");
  const [workerName, setWorkerName] = useState(worker?.name ?? "");
  const [workerPhone, setWorkerPhone] = useState(worker?.phone ?? "");
  const [age, setAge] = useState(
    worker?.age === null || worker?.age === undefined ? "" : String(worker.age),
  );
  const [gender, setGender] = useState<GenderValue>(toFormGender(worker?.gender));
  const [pickupLocation, setPickupLocation] = useState(worker?.pickupLocation ?? "");
  const [memo, setMemo] = useState(worker?.memo ?? "");
  const [isActive, setIsActive] = useState(worker?.isActive ?? true);
  const [availableDaysMask, setAvailableDaysMask] = useState(
    worker?.availableDaysMask ?? EVERY_DAY_MASK,
  );
  const [availabilityMemo, setAvailabilityMemo] = useState(
    worker?.availabilityMemo ?? "",
  );
  const [workTypeCodes, setWorkTypeCodes] = useState(worker?.workTypeCodes ?? []);
  const [workTypeRatings, setWorkTypeRatings] = useState<Record<string, number>>(
    worker?.workTypeRatings ?? {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = workerName.trim();
    const normalizedNickname = localNickname.trim();
    if (!normalizedName && !normalizedNickname) {
      window.alert("이름 또는 호칭 중 하나를 입력해주세요.");
      return;
    }

    const phoneDigits = getPhoneDigits(workerPhone);
    if (phoneDigits.length !== 11) {
      window.alert("전화번호는 숫자 11자리로 입력해주세요.");
      return;
    }

    const ageValue = age.trim() ? Number(age) : null;
    if (ageValue !== null && (!Number.isInteger(ageValue) || ageValue < 0 || ageValue > 150)) {
      window.alert("나이는 0부터 150 사이의 숫자로 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        age: ageValue,
        availableDaysMask,
        availabilityMemo: availabilityMemo.trim(),
        gender,
        isActive,
        memo: memo.trim(),
        phone: formatKoreanPhoneNumber(workerPhone),
        pickupLocation: pickupLocation.trim(),
        workTypeCodes,
        workTypeRatings,
      };

      const workers =
        isEditMode && worker?.profileUuid
          ? await updateWorkerProfile(loginId, worker.profileUuid, {
              ...payload,
              name: normalizedName,
              nickname: normalizedNickname,
            })
          : await createWorker(loginId, {
              ...payload,
              localNickname: normalizedNickname,
              workerName: normalizedName,
            });

      onSaved(workers);
      onClose();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "작업자 정보를 저장하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleGender = (nextGender: Exclude<GenderValue, "N">) => {
    setGender((currentGender) =>
      currentGender === nextGender ? "N" : nextGender,
    );
  };

  const toggleAvailableDay = (dayBit: number) => {
    setAvailableDaysMask((currentMask) => currentMask ^ dayBit);
  };

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section
        aria-labelledby="worker-profile-title"
        aria-modal="true"
        className={styles.workerProfileDialog}
        role="dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.sectionLabel}>
              {isEditMode ? "인력 정보 수정" : "인력 등록"}
            </p>
            <h2 id="worker-profile-title">
              {isEditMode ? "작업자 정보 수정" : "작업자 정보 입력"}
            </h2>
          </div>
          <div className={styles.modalHeaderActions}>
            <button
              className={styles.primaryActionButton}
              disabled={isSubmitting}
              form={formId}
              type="submit"
            >
              {isEditMode ? "저장" : "등록"}
            </button>
            <button
              className={styles.secondaryActionButton}
              disabled={isSubmitting}
              type="button"
              onClick={onClose}
            >
              취소
            </button>
          </div>
        </div>

        <div className={styles.modalScrollArea}>
          <form
            className={styles.workerProfileForm}
            id={formId}
            onSubmit={handleSubmit}
          >
            <div className={styles.workerFormGrid}>
              <label className={styles.formField}>
                <span>호칭</span>
                <input
                  placeholder="호칭을 입력하세요"
                  type="text"
                  value={localNickname}
                  onChange={(event) => setLocalNickname(event.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>이름</span>
                <input
                  placeholder="실명을 입력하세요"
                  type="text"
                  value={workerName}
                  onChange={(event) => setWorkerName(event.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>
                  전화번호 <strong className={styles.requiredMark}>*</strong>
                </span>
                <input
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="010-0000-0000"
                  required
                  type="tel"
                  value={workerPhone}
                  onChange={(event) =>
                    setWorkerPhone(formatKoreanPhoneNumber(event.target.value))
                  }
                />
              </label>

              <label className={styles.formField}>
                <span>나이</span>
                <input
                  max="150"
                  min="0"
                  placeholder="나이"
                  type="number"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                />
              </label>

              <label className={styles.formField}>
                <span>승차장소</span>
                <input
                  placeholder="승차장소를 입력하세요"
                  type="text"
                  value={pickupLocation}
                  onChange={(event) => setPickupLocation(event.target.value)}
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

              <div className={`${styles.availabilitySection} ${styles.fullWidthField}`}>
                <div className={styles.availabilityHeader}>
                  <div>
                    <span>작업자 활성화</span>
                    <p>장기 휴식, 평일/주말 가능 여부를 사무소 기준으로 관리합니다.</p>
                  </div>
                  <label className={styles.availabilityToggle}>
                    <input
                      checked={isActive}
                      type="checkbox"
                      onChange={(event) => setIsActive(event.target.checked)}
                    />
                    <span>{isActive ? "활성" : "휴식중"}</span>
                  </label>
                </div>

                <div className={styles.availabilityPresetRow}>
                  <button type="button" onClick={() => setAvailableDaysMask(EVERY_DAY_MASK)}>
                    매일
                  </button>
                  <button type="button" onClick={() => setAvailableDaysMask(WEEKDAY_MASK)}>
                    평일만
                  </button>
                  <button type="button" onClick={() => setAvailableDaysMask(WEEKEND_MASK)}>
                    주말만
                  </button>
                  <button type="button" onClick={() => setAvailableDaysMask(0)}>
                    요일 비움
                  </button>
                </div>

                <div className={styles.availableDayGrid} aria-label="출근 가능 요일">
                  {weekdayOptions.map((option) => {
                    const isSelected = (availableDaysMask & option.bit) !== 0;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={
                          isSelected
                            ? styles.activeAvailableDayButton
                            : styles.availableDayButton
                        }
                        key={option.bit}
                        type="button"
                        onClick={() => toggleAvailableDay(option.bit)}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <label className={styles.availabilityMemoField}>
                  <span>근무 가능 메모</span>
                  <input
                    placeholder="예: 7월 초까지 휴식, 토요일 오전만 가능"
                    type="text"
                    value={availabilityMemo}
                    onChange={(event) => setAvailabilityMemo(event.target.value)}
                  />
                </label>
              </div>

              <label className={`${styles.formField} ${styles.fullWidthField}`}>
                <span>메모</span>
                <textarea
                  placeholder="작업자 메모를 입력하세요"
                  rows={3}
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.workSkillSection}>
              <div className={styles.workSkillHeader}>
                <h3>가능한 작업</h3>
                <p>작업자를 배치할 때 사용할 작업 속성을 선택합니다.</p>
              </div>
              <div className={styles.workTypeEditorPanel}>
                <WorkerWorkTypeCell
                  selectedCodes={workTypeCodes}
                  selectedRatings={workTypeRatings}
                  workTypeOptions={workTypeOptions}
                  onChange={(nextCodes, nextRatings) => {
                    setWorkTypeCodes(nextCodes);
                    setWorkTypeRatings(nextRatings);
                  }}
                />
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
