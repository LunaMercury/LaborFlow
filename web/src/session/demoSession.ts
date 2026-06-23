const sessionKey = "laborflow.demoSession";
const standardSessionDurationMs = 12 * 60 * 60 * 1000;
const rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000;

export type DemoSession = {
  status: "active";
  loginId: string;
  rememberLogin: boolean;
  issuedAt: string;
  expiresAt: string;
};

export function createDemoSession(rememberLogin: boolean, loginId = "test"): DemoSession {
  const now = Date.now();
  const duration = rememberLogin
    ? rememberedSessionDurationMs
    : standardSessionDurationMs;

  return {
    status: "active",
    loginId,
    rememberLogin,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + duration).toISOString(),
  };
}

export function readDemoSession(): DemoSession | null {
  const rawSession = window.localStorage.getItem(sessionKey);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as DemoSession;
    const expiresAt = Date.parse(session.expiresAt);

    if (session.status !== "active" || Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      window.localStorage.removeItem(sessionKey);
      return null;
    }

    return session;
  } catch {
    window.localStorage.removeItem(sessionKey);
    return null;
  }
}

export function saveDemoSession(rememberLogin: boolean, loginId = "test") {
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify(createDemoSession(rememberLogin, loginId)),
  );
}

export function clearDemoSession() {
  window.localStorage.removeItem(sessionKey);
}
