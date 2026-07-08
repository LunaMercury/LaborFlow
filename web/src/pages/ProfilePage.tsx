import { useEffect, useMemo, useState, type FormEvent } from "react";
import appStyles from "../App.module.css";
import {
  fetchProfile,
  updateProfile,
  withdrawAccount,
  type ProfileResponse,
  type UpdateProfilePayload,
} from "../api/profileApi";
import styles from "./ProfilePage.module.css";

type ProfilePageProps = {
  loginId: string;
  onAccountWithdrawn: () => void;
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

function formatTwoFactorStatus(status: string) {
  return (twoFactorLabels[status] ?? status) || "미설정";
}

export function ProfilePage({ loginId, onAccountWithdrawn }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileFormState>(emptyProfile);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

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

  const handlePasswordChangeClick = () => {
    setStatusMessage("비밀번호 변경은 인증 기능 연결 후 제공됩니다.");
    setErrorMessage("");
  };

  const handleWithdrawClick = async () => {
    const confirmed = window.confirm(
      "계정을 탈퇴 처리하시겠습니까?\n\nDB에서 즉시 삭제하지 않고 계정 상태를 보관됨으로 변경합니다.",
    );

    if (!confirmed) {
      return;
    }

    setStatusMessage("");
    setErrorMessage("");
    setIsWithdrawing(true);

    try {
      await withdrawAccount(loginId);
      onAccountWithdrawn();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "계정을 탈퇴 처리하지 못했습니다.");
      setIsWithdrawing(false);
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
        </div>

        {statusMessage ? (
          <div className={styles.profileToast} role="status">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <p className={styles.profileErrorMessage}>{errorMessage}</p>
        ) : null}

        <form className={styles.profileForm} onSubmit={submitProfile}>
          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>계정 정보</h2>
            </div>
            <div className={styles.accountFieldGrid}>
              <label className={styles.profileField}>
                <span>아이디</span>
                <input readOnly type="text" value={profile.loginId || loginId} />
              </label>
              <div className={styles.passwordActionSlot}>
                <button
                  className={styles.profileSecondaryButton}
                  type="button"
                  onClick={handlePasswordChangeClick}
                >
                  비밀번호 변경
                </button>
              </div>
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
                <span>
                  휴대폰 번호 <strong className={styles.requiredMark}>*</strong>
                </span>
                <input
                  disabled={isLoading}
                  inputMode="tel"
                  required
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
              disabled={isLoading || isSaving || isWithdrawing}
              type="submit"
            >
              {isSaving ? "저장 중" : "저장"}
            </button>
            <button
              className={styles.profileSecondaryButton}
              disabled={isLoading || isSaving || isWithdrawing}
              type="button"
              onClick={resetProfile}
            >
              되돌리기
            </button>
          </div>

          <section className={styles.withdrawSection} aria-labelledby="withdraw-title">
            <div>
              <h2 id="withdraw-title">계정 탈퇴</h2>
              <p>탈퇴 시 계정은 보관됨 상태로 전환되고 서비스 화면에서 제외됩니다.</p>
            </div>
            <button
              className={styles.withdrawButton}
              disabled={isLoading || isSaving || isWithdrawing}
              type="button"
              onClick={handleWithdrawClick}
            >
              {isWithdrawing ? "처리 중" : "탈퇴"}
            </button>
          </section>
        </form>
      </section>
    </main>
  );
}
