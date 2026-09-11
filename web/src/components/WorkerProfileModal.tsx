import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createWorker,
  createWorkerFromGuestAssignment,
  deleteWorkerProfile,
  fetchWorkerSeparationRules,
  updateWorkerProfile,
  type WorkerSeparationRule,
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
  workers: WorkerRow[];
  workTypeOptions: WorkTypeOption[];
  onClose: () => void;
  onDeleted?: (workers: WorkerRow[]) => void;
  onSaved: (workers: WorkerRow[]) => void;
  sourceAssignmentUuid?: string;
};

type GenderValue = "M" | "F" | "N";

type SeparationRuleDraft = {
  otherWorkerProfileUuid: string;
  otherWorkerName: string;
  reason: string;
  ruleUuid?: string;
};

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

const bankOptions = [
  { code: "004", name: "KB국민은행" },
  { code: "088", name: "신한은행" },
  { code: "020", name: "우리은행" },
  { code: "081", name: "하나은행" },
  { code: "011", name: "NH농협은행" },
  { code: "003", name: "IBK기업은행" },
  { code: "090", name: "카카오뱅크" },
  { code: "092", name: "토스뱅크" },
  { code: "089", name: "케이뱅크" },
  { code: "071", name: "우체국" },
  { code: "023", name: "SC제일은행" },
  { code: "027", name: "한국씨티은행" },
  { code: "032", name: "부산은행" },
  { code: "031", name: "대구은행" },
  { code: "034", name: "광주은행" },
  { code: "039", name: "경남은행" },
  { code: "037", name: "전북은행" },
  { code: "035", name: "제주은행" },
  { code: "007", name: "수협은행" },
  { code: "045", name: "새마을금고" },
  { code: "048", name: "신협" },
  { code: "050", name: "저축은행" },
];

function normalizeAccountNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 20);
}

function toFormGender(gender?: string): GenderValue {
  if (gender === "MALE" || gender === "M") {
    return "M";
  }

  if (gender === "FEMALE" || gender === "F") {
    return "F";
  }

  return "N";
}

function toSeparationRuleDraft(
  rule: WorkerSeparationRule,
  workerProfileUuid: string,
): SeparationRuleDraft {
  const workerIsFirst = rule.workerProfileUuidA === workerProfileUuid;

  return {
    otherWorkerProfileUuid: workerIsFirst
      ? rule.workerProfileUuidB
      : rule.workerProfileUuidA,
    otherWorkerName: workerIsFirst ? rule.workerNameB : rule.workerNameA,
    reason: rule.reason ?? "",
    ruleUuid: rule.ruleUuid,
  };
}

export function WorkerProfileModal({
  loginId,
  mode,
  worker,
  workers,
  workTypeOptions,
  onClose,
  onDeleted,
  onSaved,
  sourceAssignmentUuid,
}: WorkerProfileModalProps) {
  const formId = `worker-profile-${mode}-form`;
  const isEditMode = mode === "edit";
  const [localNickname, setLocalNickname] = useState(worker?.nickname ?? "");
  const [workerName, setWorkerName] = useState(worker?.name ?? "");
  const [workerPhone, setWorkerPhone] = useState(worker?.phone ?? "");
  const [age, setAge] = useState(
    worker?.age === null || worker?.age === undefined ? "" : String(worker.age),
  );
  const [gender, setGender] = useState<GenderValue>(
    toFormGender(worker?.gender),
  );
  const [pickupLocation, setPickupLocation] = useState(
    worker?.pickupLocation ?? "",
  );
  const [memo, setMemo] = useState(worker?.memo ?? "");
  const [isActive, setIsActive] = useState(worker?.isActive ?? true);
  const [noShowRisk, setNoShowRisk] = useState(
    worker?.noShowRiskManual ?? false,
  );
  const [availableDaysMask, setAvailableDaysMask] = useState(
    worker?.availableDaysMask ?? EVERY_DAY_MASK,
  );
  const [availabilityMemo, setAvailabilityMemo] = useState(
    worker?.availabilityMemo ?? "",
  );
  const [bankCode, setBankCode] = useState(worker?.bankCode ?? "");
  const [bankName, setBankName] = useState(worker?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(
    worker?.accountNumber ?? "",
  );
  const [accountHolderName, setAccountHolderName] = useState(
    worker?.accountHolderName ?? "",
  );
  const [workTypeCodes, setWorkTypeCodes] = useState(
    worker?.workTypeCodes ?? [],
  );
  const [workTypeRatings, setWorkTypeRatings] = useState<
    Record<string, number>
  >(worker?.workTypeRatings ?? {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [separationRules, setSeparationRules] = useState<SeparationRuleDraft[]>([]);
  const [separationSearch, setSeparationSearch] = useState("");
  const [isLoadingSeparationRules, setIsLoadingSeparationRules] = useState(isEditMode);
  const [separationRuleError, setSeparationRuleError] = useState("");
  const [separationRuleReloadVersion, setSeparationRuleReloadVersion] = useState(0);

  useEffect(() => {
    if (!isEditMode || !worker?.profileUuid) {
      setIsLoadingSeparationRules(false);
      return;
    }

    let isMounted = true;
    setIsLoadingSeparationRules(true);
    fetchWorkerSeparationRules(loginId)
      .then((rules) => {
        if (!isMounted) {
          return;
        }
        setSeparationRules(
          rules
            .filter(
              (rule) =>
                rule.workerProfileUuidA === worker.profileUuid ||
                rule.workerProfileUuidB === worker.profileUuid,
            )
            .map((rule) => toSeparationRuleDraft(rule, worker.profileUuid as string)),
        );
        setSeparationRuleError("");
      })
      .catch(() => {
        if (isMounted) {
          setSeparationRuleError("동시 배치 주의 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSeparationRules(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isEditMode, loginId, separationRuleReloadVersion, worker?.profileUuid]);

  const separationCandidates = useMemo(() => {
    const normalizedSearch = separationSearch.trim().toLocaleLowerCase("ko-KR");
    const selectedWorkerUuids = new Set(
      separationRules.map((rule) => rule.otherWorkerProfileUuid),
    );

    return workers
      .filter((candidate) => Boolean(candidate.profileUuid))
      .filter((candidate) => candidate.profileUuid !== worker?.profileUuid)
      .filter((candidate) => !selectedWorkerUuids.has(candidate.profileUuid as string))
      .filter((candidate) => {
        if (!normalizedSearch) {
          return false;
        }
        return [candidate.name, candidate.nickname ?? "", candidate.phone]
          .join(" ")
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [separationRules, separationSearch, worker?.profileUuid, workers]);

  const handleDelete = async () => {
    if (!isEditMode || !worker?.profileUuid) {
      return;
    }

    const shouldDelete = window.confirm(
      "이 작업자를 삭제할까요? DB에서는 삭제 시각만 기록하고 목록에서 숨깁니다.",
    );
    if (!shouldDelete) {
      return;
    }

    setIsSubmitting(true);
    try {
      const workers = await deleteWorkerProfile(loginId, worker.profileUuid);
      if (onDeleted) {
        onDeleted(workers);
      } else {
        onSaved(workers);
      }
      onClose();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "작업자를 삭제하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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
    if (
      ageValue !== null &&
      (!Number.isInteger(ageValue) || ageValue < 0 || ageValue > 150)
    ) {
      window.alert("나이는 0부터 150 사이의 숫자로 입력해주세요.");
      return;
    }

    const accountNumberDigits = normalizeAccountNumber(accountNumber);
    if (
      accountNumberDigits &&
      (accountNumberDigits.length < 8 || accountNumberDigits.length > 20)
    ) {
      window.alert("계좌번호는 숫자 8자리 이상 20자리 이하로 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        accountHolderName: accountHolderName.trim(),
        accountNumber: accountNumberDigits,
        age: ageValue,
        availableDaysMask,
        availabilityMemo: availabilityMemo.trim(),
        bankCode,
        bankName,
        gender,
        isActive,
        memo: memo.trim(),
        noShowRisk,
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
              separationRules: separationRules.map((rule) => ({
                otherWorkerProfileUuid: rule.otherWorkerProfileUuid,
                reason: rule.reason.trim(),
              })),
            })
          : sourceAssignmentUuid
            ? await createWorkerFromGuestAssignment(
                loginId,
                sourceAssignmentUuid,
                {
                  ...payload,
                  localNickname: normalizedNickname,
                  workerName: normalizedName,
                },
              )
            : await createWorker(loginId, {
                ...payload,
                localNickname: normalizedNickname,
                workerName: normalizedName,
              });

      onSaved(workers);
      onClose();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "작업자 정보를 저장하지 못했습니다.",
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

  const updateBank = (nextBankCode: string) => {
    const nextBank = bankOptions.find((bank) => bank.code === nextBankCode);
    setBankCode(nextBank?.code ?? "");
    setBankName(nextBank?.name ?? "");
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
            {isEditMode && worker?.profileUuid ? (
              <button
                className={styles.dangerActionButton}
                disabled={isSubmitting}
                type="button"
                onClick={handleDelete}
              >
                삭제
              </button>
            ) : null}
            <button
              className={styles.primaryActionButton}
                disabled={
                  isSubmitting ||
                  isLoadingSeparationRules ||
                  Boolean(separationRuleError)
                }
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
                <div
                  className={styles.genderButtonGroup}
                  aria-label="성별 선택"
                >
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

              <div
                className={`${styles.availabilitySection} ${styles.fullWidthField}`}
              >
                <div className={styles.availabilityHeader}>
                  <div>
                    <span>작업자 활성화</span>
                    <p>
                      장기 휴식, 평일/주말 가능 여부를 사무소 기준으로
                      관리합니다.
                    </p>
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

                <div className={styles.workerRiskSetting}>
                  <div>
                    <strong>노쇼 위험 인물</strong>
                    <span>
                      수동 주의 태그입니다. 실제 노쇼 이력은 별도로 유지됩니다.
                    </span>
                  </div>
                  <label className={styles.availabilityToggle}>
                    <input
                      checked={noShowRisk}
                      type="checkbox"
                      onChange={(event) => setNoShowRisk(event.target.checked)}
                    />
                    <span>{noShowRisk ? "위험 표시" : "일반"}</span>
                  </label>
                </div>

                <div className={styles.availabilityPresetRow}>
                  <button
                    type="button"
                    onClick={() => setAvailableDaysMask(EVERY_DAY_MASK)}
                  >
                    매일
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailableDaysMask(WEEKDAY_MASK)}
                  >
                    평일만
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvailableDaysMask(WEEKEND_MASK)}
                  >
                    주말만
                  </button>
                  <button type="button" onClick={() => setAvailableDaysMask(0)}>
                    요일 비움
                  </button>
                </div>

                <div
                  className={styles.availableDayGrid}
                  aria-label="출근 가능 요일"
                >
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
                    onChange={(event) =>
                      setAvailabilityMemo(event.target.value)
                    }
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

              <div
                className={`${styles.paymentSection} ${styles.fullWidthField}`}
              >
                <div className={styles.paymentHeader}>
                  <span>계좌 정보</span>
                  <p>계좌 인증 없이 입력 보조만 제공합니다.</p>
                </div>
                <div className={styles.paymentFieldGrid}>
                  <label className={styles.paymentField}>
                    <span>은행</span>
                    <select
                      value={bankCode}
                      onChange={(event) => updateBank(event.target.value)}
                    >
                      <option value="">은행 선택</option>
                      {bankOptions.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.paymentField}>
                    <span>계좌번호</span>
                    <input
                      inputMode="numeric"
                      maxLength={20}
                      placeholder="숫자만 입력"
                      type="text"
                      value={accountNumber}
                      onChange={(event) =>
                        setAccountNumber(
                          normalizeAccountNumber(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label className={styles.paymentField}>
                    <span>예금주</span>
                    <input
                      placeholder="예금주명"
                      type="text"
                      value={accountHolderName}
                      onChange={(event) =>
                        setAccountHolderName(event.target.value)
                      }
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.workSkillSection}>
              <div className={styles.workSkillHeader}>
                <h3>가능한 작업</h3>
                <p>
                  작업 종류를 등록한 뒤 작업별 숙련등급을 선택합니다. 기존 별점은
                  A~D 또는 미평가로 환산해 표시합니다.
                </p>
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

            {isEditMode ? (
              <section className={styles.separationSection}>
                <div className={styles.separationHeader}>
                  <div>
                    <h3>동시 배치 주의</h3>
                    <p>같은 현장에 함께 배치하기 전에 경고할 작업자를 등록합니다.</p>
                  </div>
                  <span>{separationRules.length}명</span>
                </div>

                {isLoadingSeparationRules ? (
                  <p className={styles.separationStateText}>목록을 불러오는 중입니다.</p>
                ) : separationRuleError ? (
                  <div className={styles.separationErrorState}>
                    <p className={styles.separationErrorText}>{separationRuleError}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setSeparationRuleReloadVersion((currentVersion) => currentVersion + 1)
                      }
                    >
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={styles.separationRuleList}>
                      {separationRules.map((rule) => (
                        <div className={styles.separationRuleRow} key={rule.otherWorkerProfileUuid}>
                          <strong>{rule.otherWorkerName}</strong>
                          <input
                            maxLength={500}
                            placeholder="사유 입력 (선택)"
                            value={rule.reason}
                            onChange={(event) =>
                              setSeparationRules((currentRules) =>
                                currentRules.map((currentRule) =>
                                  currentRule.otherWorkerProfileUuid === rule.otherWorkerProfileUuid
                                    ? { ...currentRule, reason: event.target.value }
                                    : currentRule,
                                ),
                              )
                            }
                          />
                          <button
                            aria-label={`${rule.otherWorkerName} 동시 배치 주의 해제`}
                            type="button"
                            onClick={() =>
                              setSeparationRules((currentRules) =>
                                currentRules.filter(
                                  (currentRule) =>
                                    currentRule.otherWorkerProfileUuid !== rule.otherWorkerProfileUuid,
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {separationRules.length === 0 ? (
                        <p className={styles.separationStateText}>등록된 작업자가 없습니다.</p>
                      ) : null}
                    </div>

                    <div className={styles.separationSearchField}>
                      <input
                        autoComplete="off"
                        placeholder="이름, 호칭 또는 전화번호 검색"
                        type="search"
                        value={separationSearch}
                        onChange={(event) => setSeparationSearch(event.target.value)}
                      />
                      {separationCandidates.length > 0 ? (
                        <div className={styles.separationSearchResults}>
                          {separationCandidates.map((candidate) => {
                            const candidateName =
                              candidate.name.trim() || candidate.nickname?.trim() || "이름 없음";
                            return (
                              <button
                                key={candidate.profileUuid}
                                type="button"
                                onClick={() => {
                                  setSeparationRules((currentRules) => [
                                    ...currentRules,
                                    {
                                      otherWorkerProfileUuid: candidate.profileUuid as string,
                                      otherWorkerName: candidateName,
                                      reason: "",
                                    },
                                  ]);
                                  setSeparationSearch("");
                                }}
                              >
                                <strong>{candidateName}</strong>
                                <span>{candidate.phone}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
