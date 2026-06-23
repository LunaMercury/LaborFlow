import type { FormEvent } from "react";
import styles from "../App.module.css";
import { socialLoginOptions } from "../data/socialLoginOptions";

type LoginPageProps = {
  onLogin: (rememberLogin: boolean, loginId: string) => void;
};

const socialLoginButtonClasses = {
  google: styles.googleLoginButton,
  naver: styles.naverLoginButton,
  kakao: styles.kakaoLoginButton,
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const loginId = String(formData.get("loginId") || "test").trim() || "test";
    onLogin(formData.get("rememberLogin") === "on", loginId);
  };

  return (
    <main className={styles.loginMainContent}>
      <section className={styles.loginPanel} aria-labelledby="login-title">
        <div className={styles.loginHeading}>
          <p className={styles.sectionLabel}>계정 로그인</p>
          <h1 id="login-title">LaborFlow에 로그인</h1>
        </div>

        <form className={styles.loginForm} onSubmit={handleSubmit}>
          <label className={styles.formField}>
            <span>아이디</span>
            <input
              autoComplete="username"
              name="loginId"
              placeholder="아이디를 입력하세요"
              type="text"
            />
          </label>

          <label className={styles.formField}>
            <span>비밀번호</span>
            <input
              autoComplete="current-password"
              name="password"
              placeholder="비밀번호를 입력하세요"
              type="password"
            />
          </label>

          <div className={styles.loginOptionsRow}>
            <label className={styles.rememberLogin}>
              <input name="rememberLogin" type="checkbox" />
              <span>로그인 유지</span>
            </label>
            <a href="/password-reset">비밀번호 찾기</a>
          </div>

          <button className={styles.primaryLoginButton} type="submit">
            로그인
          </button>
        </form>

        <div className={styles.loginDivider} aria-hidden="true">
          <span />
          <p>또는</p>
          <span />
        </div>

        <div className={styles.socialLoginList} aria-label="소셜 로그인">
          {socialLoginOptions.map((option) => (
            <button
              className={`${styles.socialLoginButton} ${socialLoginButtonClasses[option.provider]}`}
              type="button"
              key={option.label}
              onClick={() => onLogin(true, "test")}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
