import { useEffect, useMemo, useState, type FormEvent } from "react";
import appStyles from "../App.module.css";
import styles from "./ProfilePage.module.css";

type ProfilePageProps = {
  loginId: string;
};

type ProfileFormState = {
  accountRole: string;
  accountStatus: string;
  email: string;
  loginNotification: boolean;
  officeAddress: string;
  officeName: string;
  officePhone: string;
  ownerName: string;
  passwordChangedAt: string;
  phone: string;
  registrationNumber: string;
  scheduleNotification: boolean;
  twoFactorStatus: string;
};

const defaultProfile: ProfileFormState = {
  accountRole: "인력사무소 소장",
  accountStatus: "활성",
  email: "",
  loginNotification: true,
  officeAddress: "",
  officeName: "",
  officePhone: "",
  ownerName: "",
  passwordChangedAt: "",
  phone: "",
  registrationNumber: "",
  scheduleNotification: true,
  twoFactorStatus: "미설정",
};

function getProfileStorageKey(loginId: string) {
  return `laborflow.profile:${loginId}`;
}

function loadProfile(loginId: string): ProfileFormState {
  const rawProfile = window.localStorage.getItem(getProfileStorageKey(loginId));

  if (!rawProfile) {
    return defaultProfile;
  }

  try {
    return {
      ...defaultProfile,
      ...(JSON.parse(rawProfile) as Partial<ProfileFormState>),
    };
  } catch {
    return defaultProfile;
  }
}

function saveProfile(loginId: string, profile: ProfileFormState) {
  window.localStorage.setItem(
    getProfileStorageKey(loginId),
    JSON.stringify(profile),
  );
}

export function ProfilePage({ loginId }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileFormState>(() =>
    loadProfile(loginId),
  );
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    setProfile(loadProfile(loginId));
    setStatusMessage("");
  }, [loginId]);

  const displayName = useMemo(
    () => profile.ownerName.trim() || loginId,
    [loginId, profile.ownerName],
  );

  const updateProfile = <Key extends keyof ProfileFormState>(
    key: Key,
    value: ProfileFormState[Key],
  ) => {
    setProfile((currentProfile) => ({
      ...currentProfile,
      [key]: value,
    }));
  };

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveProfile(loginId, profile);
    setStatusMessage("내 정보를 저장했습니다.");
  };

  const resetProfile = () => {
    const savedProfile = loadProfile(loginId);
    setProfile(savedProfile);
    setStatusMessage("마지막 저장 상태로 되돌렸습니다.");
  };

  return (
    <main className={appStyles.tableMainContent}>
      <section className={styles.profilePanel} aria-labelledby="profile-title">
        <div className={styles.profileHeader}>
          <div>
            <p className={styles.sectionLabel}>내 정보</p>
            <h1 id="profile-title">{displayName}</h1>
            <p className={styles.profileDescription}>
              계정, 연락처, 사무소, 보안 알림에 필요한 기본 정보를 관리합니다.
            </p>
          </div>
          <div className={styles.profileStatusGroup}>
            <span>{profile.accountRole}</span>
            <strong>{profile.accountStatus}</strong>
          </div>
        </div>

        {statusMessage ? (
          <p className={styles.profileStatusMessage}>{statusMessage}</p>
        ) : null}

        <form className={styles.profileForm} onSubmit={submitProfile}>
          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>계정 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>아이디</span>
                <input readOnly type="text" value={loginId} />
              </label>
              <label className={styles.profileField}>
                <span>권한</span>
                <input
                  type="text"
                  value={profile.accountRole}
                  onChange={(event) =>
                    updateProfile("accountRole", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>계정 상태</span>
                <select
                  value={profile.accountStatus}
                  onChange={(event) =>
                    updateProfile("accountStatus", event.target.value)
                  }
                >
                  <option value="활성">활성</option>
                  <option value="휴면">휴면</option>
                  <option value="검토 필요">검토 필요</option>
                </select>
              </label>
            </div>
          </section>

          <section className={styles.profileSection}>
            <div className={styles.profileSectionHeader}>
              <h2>개인 정보</h2>
            </div>
            <div className={styles.profileFieldGrid}>
              <label className={styles.profileField}>
                <span>이름</span>
                <input
                  type="text"
                  value={profile.ownerName}
                  onChange={(event) =>
                    updateProfile("ownerName", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>휴대폰 번호</span>
                <input
                  inputMode="tel"
                  type="tel"
                  value={profile.phone}
                  onChange={(event) => updateProfile("phone", event.target.value)}
                />
              </label>
              <label className={styles.profileField}>
                <span>이메일</span>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(event) => updateProfile("email", event.target.value)}
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
                  type="text"
                  value={profile.officeName}
                  onChange={(event) =>
                    updateProfile("officeName", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>대표 전화</span>
                <input
                  inputMode="tel"
                  type="tel"
                  value={profile.officePhone}
                  onChange={(event) =>
                    updateProfile("officePhone", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>사업자등록번호</span>
                <input
                  inputMode="numeric"
                  type="text"
                  value={profile.registrationNumber}
                  onChange={(event) =>
                    updateProfile("registrationNumber", event.target.value)
                  }
                />
              </label>
              <label className={`${styles.profileField} ${styles.fullWidthField}`}>
                <span>사무소 주소</span>
                <input
                  type="text"
                  value={profile.officeAddress}
                  onChange={(event) =>
                    updateProfile("officeAddress", event.target.value)
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
                <span>비밀번호 변경일</span>
                <input
                  type="date"
                  value={profile.passwordChangedAt}
                  onChange={(event) =>
                    updateProfile("passwordChangedAt", event.target.value)
                  }
                />
              </label>
              <label className={styles.profileField}>
                <span>2단계 인증</span>
                <select
                  value={profile.twoFactorStatus}
                  onChange={(event) =>
                    updateProfile("twoFactorStatus", event.target.value)
                  }
                >
                  <option value="미설정">미설정</option>
                  <option value="설정">설정</option>
                  <option value="검토 필요">검토 필요</option>
                </select>
              </label>
              <label className={styles.profileToggle}>
                <input
                  checked={profile.loginNotification}
                  type="checkbox"
                  onChange={(event) =>
                    updateProfile("loginNotification", event.target.checked)
                  }
                />
                <span>로그인 알림</span>
              </label>
              <label className={styles.profileToggle}>
                <input
                  checked={profile.scheduleNotification}
                  type="checkbox"
                  onChange={(event) =>
                    updateProfile("scheduleNotification", event.target.checked)
                  }
                />
                <span>일정 변경 알림</span>
              </label>
            </div>
          </section>

          <div className={styles.profileActions}>
            <button className={styles.profilePrimaryButton} type="submit">
              저장
            </button>
            <button
              className={styles.profileSecondaryButton}
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
