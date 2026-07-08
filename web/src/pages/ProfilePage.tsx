import { useEffect, useMemo, useState, type FormEvent } from "react";
import appStyles from "../App.module.css";
import {
  fetchProfile,
  updateProfile,
  type ProfileResponse,
  type UpdateProfilePayload,
} from "../api/profileApi";
import styles from "./ProfilePage.module.css";

type ProfilePageProps = {
  loginId: string;
};

type ProfileFormState = UpdateProfilePayload & {
  accountRole: string;
  accountStatus: string;
  loginId: string;
  passwordUpdatedAt: string;
  twoFactorStatus: string;
};

const emptyProfile: ProfileFormState = {
  accountRole: "",
  accountStatus: "",
  agencyName: "",
  bankAccount: "",
  bankAccountHolderName: "",
  bankName: "",
  businessRegistrationNumber: "",
  email: "",
  loginId: "",
  loginNotificationEnabled: true,
  officeAddress: "",
  officePhone: "",
  ownerName: "",
  passwordUpdatedAt: "",
  phone: "",
  scheduleNotificationEnabled: true,
  twoFactorStatus: "DISABLED",
};

const roleLabels: Record<string, string> = {
  ADMIN: "관리자",
  LABOR_AGENCY_OWNER: "인력사무소 소장",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "활성",
  ARCHIVED: "보관됨",
  DISABLED: "비활성",
  LOCKED: "잠김",
};

const twoFactorLabels: Record<string, string> = {
  DISABLED: "미설정",
  ENABLED: "설정됨",
};

function toFormState(profile: ProfileResponse): ProfileFormState {
  return {
    accountRole: profile.accountRole,
    accountStatus: profile.accountStatus,
    agencyName: profile.agencyName,
    bankAccount: profile.bankAccount,
    bankAccountHolderName: profile.bankAccountHolderName,
    bankName: profile.bankName,
    businessRegistrationNumber: profile.businessRegistrationNumber,
    email: profile.email,
    loginId: profile.loginId,
    loginNotificationEnabled: profile.loginNotificationEnabled,
    officeAddress: profile.officeAddress,
    officePhone: profile.officePhone,
    ownerName: profile.ownerName,
    passwordUpdatedAt: profile.passwordUpdatedAt,
    phone: profile.phone,
    scheduleNotificationEnabled: profile.scheduleNotificationEnabled,
    twoFactorStatus: profile.twoFactorStatus,
  };
}

function toPayload(profile: ProfileFormState): UpdateProfilePayload {
  return {
    agencyName: profile.agencyName,
    bankAccount: profile.bankAccount,
    bankAccountHolderName: profile.bankAccountHolderName,
    bankName: profile.bankName,
    businessRegistrationNumber: profile.businessRegistrationNumber,
    email: profile.email,
    loginNotificationEnabled: profile.loginNotificationEnabled,
    officeAddress: profile.officeAddress,
    officePhone: profile.officePhone,
    ownerName: profile.ownerName,
    phone: profile.phone,
    scheduleNotificationEnabled: profile.scheduleNotificationEnabled,
  };
}

function formatRole(roleCodes: string) {
  return (
    roleCodes
    .split(",")
    .map((roleCode) => roleLabels[roleCode] ?? roleCode)
    .filter(Boolean)
    .join(", ")
  ) || "권한 없음";
}

function formatStatus(status: string) {
  return (statusLabels[status] ?? status) || "알 수 없음";
}

function formatTwoFactorStatus(status: string) {
  return (twoFactorLabels[status] ?? status) || "미설정";
}

export function ProfilePage({ loginId }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileFormState>(emptyProfile);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoading(true);
      setStatusMessage("");
      setErrorMessage("");

      try {
        const loadedProfile = await fetchProfile(loginId);
        if (isMounted) {
          setProfile(toFormState(loadedProfile));
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "내 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [loginId]);

  const displayName = useMemo(
    () => profile.ownerName.trim() || profile.loginId || loginId,
    [loginId, profile.loginId, profile.ownerName],
  );

  const updateProfileField = <Key extends keyof ProfileFormState>(
    key: Key,
    value: ProfileFormState[Key],
  ) => {
    setProfile((currentProfile) => ({
      ...currentProfile,
      [key]: value,
    }));
  };

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");
    setIsSaving(true);

    try {
      const savedProfile = await updateProfile(loginId, toPayload(profile));
      setProfile(toFormState(savedProfile));
      setStatusMessage("내 정보를 저장했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "내 정보를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const resetProfile = async () => {
    setStatusMessage("");
    setErrorMessage("");
    setIsLoading(true);

    try {
      const loadedProfile = await fetchProfile(loginId);
      setProfile(toFormState(loadedProfile));
      setStatusMessage("마지막 저장 상태로 되돌렸습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "내 정보를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={appStyles.tableMainContent}>
      <section className={styles.profilePanel} aria-labelledby="profile-title">
        <div className={styles.profileHeader}>
          <div>
            <p className={styles.sectionLabel}>내 정보</p>
            <h1 id="profile-title">{displayName}</h1>
            <p className={styles.profileDescription}>
              계정, 연락처, 사무소, 정산 정보를 관리합니다. 민감정보는 별도 프로필 테이블에 저장됩니다.
            </p>
          </div>
          <div className={styles.profileStatusGroup}>
            <span>{formatRole(profile.accountRole)}</span>
            <strong>{formatStatus(profile.accountStatus)}</strong>
          </div>
        </div>

        {statusMessage ? (
          <p className={styles.profileStatusMessage}>{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className={styles.profileErrorMessage}>{errorMessage}</p>
        ) : null}

        <form className={styles.profileForm} onSubmit={submitProfile}>
          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>계정 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>아이디</span>
                <input readOnly type="text" value={profile.loginId || loginId} />
              </label>
              <label className={styles.profileField}>
                <span>권한</span>
                <input readOnly type="text" value={formatRole(profile.accountRole)} />
              </label>
              <label className={styles.profileField}>
                <span>계정 상태</span>
                <input readOnly type="text" value={formatStatus(profile.accountStatus)} />
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>대표자 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>
                  이름 <strong className={styles.requiredMark}>*</strong>
                </span>
                <input
                  disabled={isLoading}
                  required
                  type="text"
                  value={profile.ownerName}
                  onChange={(event) =>
                    updateProfileField("ownerName", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>휴대폰 번호</span>
                <input
                  disabled={isLoading}
                  inputMode="tel"
                  type="tel"
                  value={profile.phone}
                  onChange={(event) => updateProfileField("phone", event.target.value)}
                />
              </label>
              <label className={styles.profileField}>
                <span>이메일</span>
                <input
                  disabled={isLoading}
                  type="email"
                  value={profile.email}
                  onChange={(event) => updateProfileField("email", event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>사무소 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>사무소명</span>
                <input
                  disabled={isLoading}
                  type="text"
                  value={profile.agencyName}
                  onChange={(event) =>
                    updateProfileField("agencyName", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>사무소 전화</span>
                <input
                  disabled={isLoading}
                  inputMode="tel"
                  type="tel"
                  value={profile.officePhone}
                  onChange={(event) =>
                    updateProfileField("officePhone", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>사업자등록번호</span>
                <input
                  disabled={isLoading}
                  inputMode="numeric"
                  type="text"
                  value={profile.businessRegistrationNumber}
                  onChange={(event) =>
                    updateProfileField("businessRegistrationNumber", event.target.value)
                  }
                />
              </label>
              <label className={`${styles.profileField} ${styles.fullWidthField}`}>
                <span>사무소 주소</span>
                <input
                  disabled={isLoading}
                  type="text"
                  value={profile.officeAddress}
                  onChange={(event) =>
                    updateProfileField("officeAddress", event.target.value)
                  }
                />
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>정산 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>은행명</span>
                <input
                  disabled={isLoading}
                  type="text"
                  value={profile.bankName}
                  onChange={(event) =>
                    updateProfileField("bankName", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>계좌번호</span>
                <input
                  disabled={isLoading}
                  inputMode="numeric"
                  type="text"
                  value={profile.bankAccount}
                  onChange={(event) =>
                    updateProfileField("bankAccount", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>예금주</span>
                <input
                  disabled={isLoading}
                  type="text"
                  value={profile.bankAccountHolderName}
                  onChange={(event) =>
                    updateProfileField("bankAccountHolderName", event.target.value)
                  }
                />
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>보안 및 알림</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>마지막 계정 변경일</span>
                <input readOnly type="text" value={profile.passwordUpdatedAt} />
              </label>
              <label className={styles.profileField}>
                <span>2단계 인증</span>
                <input readOnly type="text" value={formatTwoFactorStatus(profile.twoFactorStatus)} />
              </label>
              <label className={styles.profileToggle}>
                <input
                  checked={profile.loginNotificationEnabled}
                  disabled={isLoading}
                  type="checkbox"
                  onChange={(event) =>
                    updateProfileField("loginNotificationEnabled", event.target.checked)
                  }
                />
                <span>로그인 알림</span>
              </label>
              <label className={styles.profileToggle}>
                <input
                  checked={profile.scheduleNotificationEnabled}
                  disabled={isLoading}
                  type="checkbox"
                  onChange={(event) =>
                    updateProfileField("scheduleNotificationEnabled", event.target.checked)
                  }
                />
                <span>일정 변경 알림</span>
              </label>
            </div>
          </section>

          <div className={styles.profileActions}>
            <button
              className={styles.profilePrimaryButton}
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving ? "저장 중" : "저장"}
            </button>
            <button
              className={styles.profileSecondaryButton}
              disabled={isLoading || isSaving}
              type="button"
              onClick={resetProfile}
            >
              되돌리기
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
