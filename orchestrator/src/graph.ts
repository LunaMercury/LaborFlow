import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  managerDecisionSchema,
  specialistPlanSchema,
  verifierReportSchema,
  type ManagerDecision,
  type SpecialistPlan,
  type VerifierReport,
} from "./schemas.js";
import { projectContext } from "./projectContext.js";
import type { RepoSnapshot } from "./repoSnapshot.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import type { WorkerResultPacket } from "./resultSchemas.js";
import {
  categoryTemplateRegistry,
  renderAppliedTemplatesYaml,
  type TemplateCategory,
  type TemplateContextFlags,
} from "./templateRegistry.js";

type SpecialistRole = "frontend" | "rust" | "java" | "mobile";
type ParticipationMode = SpecialistPlan["participationMode"];
type RequestCategory = TemplateCategory;

const OrchestratorState = Annotation.Root({
  userRequest: Annotation<string>,
  mock: Annotation<boolean>,
  repoSnapshot: Annotation<RepoSnapshot>,
  managerDecision: Annotation<ManagerDecision | undefined>,
  frontendPlan: Annotation<SpecialistPlan | undefined>,
  rustPlan: Annotation<SpecialistPlan | undefined>,
  javaPlan: Annotation<SpecialistPlan | undefined>,
  mobilePlan: Annotation<SpecialistPlan | undefined>,
  taskPackets: Annotation<WorkerTaskPacket[] | undefined>,
  workerResults: Annotation<WorkerResultPacket[] | undefined>,
  verifierReport: Annotation<VerifierReport | undefined>,
  finalReport: Annotation<string | undefined>,
});

type OrchestratorStateType = typeof OrchestratorState.State;

function createModel() {
  return new ChatOpenAI({
    model: process.env.ORCHESTRATOR_MODEL || "gpt-4.1",
    temperature: 0,
  });
}

function createMockManagerDecision(userRequest: string): ManagerDecision {
  return {
    summary: `[MOCK] 매니저 계획: ${userRequest}`,
    frontendMode: "skip",
    rustMode: "skip",
    javaMode: "skip",
    mobileMode: "skip",
    integrationNotes: [],
    exclusionReasons: {
      frontend: "mock 기본값에서는 참여하지 않습니다.",
      rust: "mock 기본값에서는 참여하지 않습니다.",
      java: "mock 기본값에서는 참여하지 않습니다.",
      mobile: "mock 기본값에서는 참여하지 않습니다.",
    },
  };
}

function createMockSpecialistPlan(role: SpecialistRole, userRequest: string): SpecialistPlan {
  const touchedAreas: Record<SpecialistRole, string[]> = {
    frontend: ["web/src/components", "web/src/config.ts"],
    rust: ["backend-fast/src/handlers.rs", "backend-fast/src/main.rs"],
    java: ["backend-core/src/main/java/com/whiteboard/core/auth", "backend-core/src/main/resources"],
    mobile: ["mobile/app/src/main/java/com/example/whiteboardcapture"],
  };

  const verification: Record<SpecialistRole, string[]> = {
    frontend: [".skills/verify-web.ps1"],
    rust: [".skills/verify-fast.ps1"],
    java: [".skills/verify-core.ps1"],
    mobile: [".skills/verify-mobile.ps1"],
  };

  return {
    role,
    participationMode: role === "rust" ? "review" : role === "mobile" ? "review" : "implement",
    goal: `[MOCK] ${role} 모듈 계획: "${userRequest}"`,
    touchedAreas: touchedAreas[role],
    implementationSteps: [
      "현재 프로젝트 계약과 필수 정책에 맞춰 요청을 분석합니다.",
      "이 모듈에 필요한 변경만 계획합니다.",
      "총괄 매니저가 통합할 수 있도록 모듈 간 의존성을 명시합니다.",
    ],
    dependencies: [
      "API/env 변경은 총괄 매니저를 통해 조율합니다.",
    ],
    verification: verification[role],
    risks: [
      "이 응답은 실제 모델 호출 없이 오케스트레이션 흐름을 검증하기 위한 mock 결과입니다.",
    ],
  };
}

function isAuthRelatedRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "login",
    "oauth",
    "oauth2",
    "jwt",
    "auth",
    "signin",
    "sign-in",
    "social",
    "naver",
    "google",
    "login provider",
    "로그인",
    "인증",
    "토큰",
    "jwt",
    "네이버",
    "구글",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isDesignRelatedRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "design",
    "ui",
    "ux",
    "layout",
    "style",
    "css",
    "theme",
    "redesign",
    "디자인",
    "화면",
    "스타일",
    "레이아웃",
    "테마",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isRedisRelatedRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "redis",
    "cache",
    "caching",
    "session store",
    "pubsub",
    "queue",
    "bullmq",
    "레디스",
    "캐시",
    "세션 저장소",
    "큐",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isRealtimeRelatedRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "websocket",
    "ws",
    "wss",
    "realtime",
    "real-time",
    "live update",
    "fan-out",
    "웹소켓",
    "실시간",
    "소켓",
    "스트리밍",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isHotPathRedisRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const redisKeywords = ["redis", "cache", "caching", "레디스", "캐시"];
  const hotPathKeywords = [
    "upload",
    "websocket",
    "ws",
    "wss",
    "realtime",
    "fan-out",
    "hot path",
    "이미지 업로드",
    "웹소켓",
    "실시간",
    "핫패스",
  ];

  return redisKeywords.some((keyword) => normalized.includes(keyword))
    && hotPathKeywords.some((keyword) => normalized.includes(keyword));
}

function isServiceWideLoginRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "for the service",
    "service-wide",
    "entire service",
    "app-wide",
    "social login",
    "웹과 모바일 모두",
    "모바일도",
    "앱에서도",
    "소셜 로그인",
    "서비스 전체",
    "전체 플랫폼",
    "모든 클라이언트",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isExplicitlyWebOnlyRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "web only",
    "frontend only",
    "브라우저만",
    "웹만",
    "프론트만",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function isExplicitlyMobileRequest(userRequest: string): boolean {
  const normalized = userRequest.toLowerCase();
  const keywords = [
    "mobile",
    "android",
    "app",
    "모바일",
    "안드로이드",
    "앱",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function detectRequestCategories(userRequest: string): RequestCategory[] {
  const categories: RequestCategory[] = [];

  if (isAuthRelatedRequest(userRequest)) {
    categories.push("auth");
  }
  if (isDesignRelatedRequest(userRequest)) {
    categories.push("design");
  }
  if (isRedisRelatedRequest(userRequest)) {
    categories.push("redis");
  }
  if (isRealtimeRelatedRequest(userRequest)) {
    categories.push("realtime");
  }

  return categories;
}

function buildTemplateFlags(userRequest: string): TemplateContextFlags {
  return {
    webOnly: isExplicitlyWebOnlyRequest(userRequest),
    mobileRequested: isExplicitlyMobileRequest(userRequest),
    serviceWide: isServiceWideLoginRequest(userRequest),
    hotPathRedis: isHotPathRedisRequest(userRequest),
  };
}

function buildRegistryVerifierChecks(userRequest: string): string[] {
  const categories = detectRequestCategories(userRequest);
  return Array.from(
    new Set(
      categories.flatMap((category) => categoryTemplateRegistry[category].verifierChecks),
    ),
  );
}

function strongerMode(current: ParticipationMode, required: ParticipationMode): ParticipationMode {
  const rank: Record<ParticipationMode, number> = {
    skip: 0,
    review: 1,
    implement: 2,
  };

  return rank[current] >= rank[required] ? current : required;
}

function applyMandatoryPolicies(userRequest: string, decision: ManagerDecision): ManagerDecision {
  const categories = detectRequestCategories(userRequest);
  const flags = buildTemplateFlags(userRequest);
  const { serviceWide, webOnly, mobileRequested, hotPathRedis } = flags;

  if (categories.length === 0) {
    return decision;
  }

  let frontendMode = decision.frontendMode;
  let rustMode = decision.rustMode;
  let javaMode = decision.javaMode;
  let mobileMode = decision.mobileMode;
  let mobileReason = decision.exclusionReasons.mobile;
  const integrationNotes = [...decision.integrationNotes];

  if (categories.includes("auth")) {
    frontendMode = strongerMode(frontendMode, "implement");
    rustMode = strongerMode(rustMode, "review");
    javaMode = "implement";

    if (webOnly) {
      mobileMode = "skip";
      mobileReason = "요청 범위가 웹 전용으로 명시되어 있으므로 모바일은 제외합니다.";
    } else if (serviceWide || mobileRequested) {
      mobileMode = "implement";
      mobileReason = "";
    } else {
      mobileMode = "review";
      mobileReason = "";
    }

    integrationNotes.push(
      `프로젝트 정책: ${categoryTemplateRegistry.auth.notes.default}`,
      webOnly
        ? `프로젝트 정책: ${categoryTemplateRegistry.auth.notes.variants?.webOnly}`
        : `프로젝트 정책: ${categoryTemplateRegistry.auth.notes.variants?.nonWebOnly}`,
    );
  }

  if (categories.includes("design")) {
    frontendMode = strongerMode(frontendMode, "implement");

    if (mobileRequested && !webOnly) {
      mobileMode = strongerMode(mobileMode, "implement");
      mobileReason = "";
    }

    integrationNotes.push(
      mobileRequested && !webOnly
        ? `프로젝트 정책: ${categoryTemplateRegistry.design.notes.variants?.mobileRequested}`
        : `프로젝트 정책: ${categoryTemplateRegistry.design.notes.default}`,
    );
  }

  if (categories.includes("redis")) {
    javaMode = strongerMode(javaMode, "implement");
    rustMode = strongerMode(rustMode, "review");
    if (hotPathRedis) {
      rustMode = strongerMode(rustMode, "implement");
    }
    integrationNotes.push(
      hotPathRedis
        ? `프로젝트 정책: ${categoryTemplateRegistry.redis.notes.variants?.hotPath}`
        : `프로젝트 정책: ${categoryTemplateRegistry.redis.notes.default}`,
    );
  }

  if (categories.includes("realtime")) {
    rustMode = strongerMode(rustMode, "implement");
    frontendMode = strongerMode(frontendMode, "implement");
    javaMode = strongerMode(javaMode, "review");

    if (mobileRequested && !webOnly) {
      mobileMode = strongerMode(mobileMode, "review");
      mobileReason = "";
    }

    integrationNotes.push(
      `프로젝트 정책: ${categoryTemplateRegistry.realtime.notes.default}`,
    );
  }

  return {
    ...decision,
    frontendMode,
    rustMode,
    javaMode,
    mobileMode,
    integrationNotes,
    exclusionReasons: {
      ...decision.exclusionReasons,
      frontend: frontendMode === "skip" ? decision.exclusionReasons.frontend : "",
      rust: rustMode === "skip" ? decision.exclusionReasons.rust : "",
      java: javaMode === "skip" ? decision.exclusionReasons.java : "",
      mobile: mobileReason,
    },
  };
}

function shouldRunRole(role: SpecialistRole, decision: ManagerDecision): boolean {
  const modeMap: Record<SpecialistRole, ManagerDecision["frontendMode"]> = {
    frontend: decision.frontendMode,
    rust: decision.rustMode,
    java: decision.javaMode,
    mobile: decision.mobileMode,
  };

  return modeMap[role] !== "skip";
}

function modeForRole(role: SpecialistRole, decision: ManagerDecision): SpecialistPlan["participationMode"] {
  const modeMap: Record<SpecialistRole, SpecialistPlan["participationMode"]> = {
    frontend: decision.frontendMode,
    rust: decision.rustMode,
    java: decision.javaMode,
    mobile: decision.mobileMode,
  };

  return modeMap[role];
}

function filterTouchedAreas(role: SpecialistRole, touchedAreas: string[], repoSnapshot: RepoSnapshot): string[] {
  const existingFiles = new Set(repoSnapshot.moduleFiles[role]);

  return touchedAreas.filter((area) => {
    const normalized = area.replaceAll("\\", "/");
    if (existingFiles.has(normalized)) {
      return true;
    }

    for (const existingFile of existingFiles) {
      if (existingFile.startsWith(`${normalized}/`)) {
        return true;
      }
    }

    return false;
  });
}

function normalizeSpecialistPlan(role: SpecialistRole, plan: SpecialistPlan, state: OrchestratorStateType): SpecialistPlan {
  const participationMode = modeForRole(role, state.managerDecision!);
  const filteredTouchedAreas = filterTouchedAreas(role, plan.touchedAreas, state.repoSnapshot);

  return {
    ...plan,
    role,
    participationMode,
    touchedAreas: filteredTouchedAreas.length > 0 ? filteredTouchedAreas : plan.touchedAreas,
  };
}

function moduleRootForRole(role: SpecialistRole): string {
  switch (role) {
    case "frontend":
      return "web/**";
    case "rust":
      return "backend-fast/**";
    case "java":
      return "backend-core/**";
    case "mobile":
      return "mobile/**";
  }
}

function blockedPathsForRole(role: SpecialistRole): string[] {
  return (["frontend", "rust", "java", "mobile"] as SpecialistRole[])
    .filter((candidate) => candidate !== role)
    .map((candidate) => moduleRootForRole(candidate));
}

function contractsForRole(role: SpecialistRole, userRequest: string): string[] {
  const shared = [
    "기존 환경변수 이름과 인증 계약을 임의로 바꾸지 않습니다.",
    "변경이 필요한 계약은 master 세션에 명시적으로 보고합니다.",
  ];

  const categories = detectRequestCategories(userRequest);
  const registryContracts = categories.flatMap((category) => categoryTemplateRegistry[category].roleContracts[role] ?? []);
  const roleDefaults: Record<SpecialistRole, string[]> = {
    frontend: [
      "VITE_API_BASE_URL, VITE_REALTIME_WS_URL 계약을 유지합니다.",
      "백엔드 메시지 포맷과 JWT 전달 방식을 합의 없이 바꾸지 않습니다.",
    ],
    rust: [
      "JWT_SECRET_KEY, ALLOWED_WEB_ORIGINS, PUBLIC_BASE_URL 계약을 유지합니다.",
      "업로드 hot path와 websocket fan-out의 성능 특성을 해치지 않습니다.",
    ],
    java: [
      "JWT 발급 구조와 사용자 식별 계약을 Rust/Web/Mobile과 일치시킵니다.",
      "application.properties와 .env 기반 환경설정 정책을 유지합니다.",
    ],
    mobile: [
      "Spring 로그인 계약과 Rust 업로드 인증 계약을 임의로 바꾸지 않습니다.",
      "모바일의 JWT 저장/복원 흐름이 기존 업로드 경로와 호환되어야 합니다.",
    ],
  };

  return [...shared, ...roleDefaults[role], ...registryContracts];
}

function policyChecksForRole(userRequest: string): string[] {
  const categories = detectRequestCategories(userRequest);
  const checks = categories.flatMap((category) => categoryTemplateRegistry[category].verifierChecks);
  return Array.from(new Set(checks));
}

function createTaskPacketFromPlan(plan: SpecialistPlan, userRequest: string): WorkerTaskPacket {
  return {
    role: plan.role,
    participationMode: plan.participationMode,
    goal: plan.goal,
    allowedPaths: [moduleRootForRole(plan.role)],
    blockedPaths: blockedPathsForRole(plan.role),
    touchedAreas: plan.touchedAreas,
    implementationSteps: plan.implementationSteps,
    dependencies: plan.dependencies,
    requiredVerification: plan.verification,
    contracts: contractsForRole(plan.role, userRequest),
    policyChecks: policyChecksForRole(userRequest),
    handoffOutput: [
      "changed_files",
      "summary",
      "contracts_changed",
      "verification_run",
      "risks",
      "questions",
    ],
  };
}

function createPendingWorkerResult(plan: SpecialistPlan): WorkerResultPacket {
  return {
    role: plan.role,
    status: "pending",
    changedFiles: [],
    summary: `${plan.role} worker의 실제 실행 결과가 아직 수집되지 않았습니다.`,
    contractsChanged: [],
    verificationRun: [],
    risks: ["실행기(worker runner)가 아직 연결되지 않아 결과 packet은 placeholder 상태입니다."],
    questions: ["이 worker를 어떤 실행기로 돌릴지(master 세션, Codex CLI, 별도 API worker) 결정이 필요합니다."],
    proposedEdits: [],
  };
}

function buildSummaryFromModes(userRequest: string, decision: ManagerDecision): string {
  const modules: string[] = [];

  if (decision.javaMode !== "skip") {
    modules.push(`Java(Spring Boot)는 ${decision.javaMode === "implement" ? "구현" : "리뷰"}`);
  }
  if (decision.rustMode !== "skip") {
    modules.push(`Rust(backend-fast)는 ${decision.rustMode === "implement" ? "구현" : "리뷰"}`);
  }
  if (decision.frontendMode !== "skip") {
    modules.push(`웹 프론트엔드는 ${decision.frontendMode === "implement" ? "구현" : "리뷰"}`);
  }
  if (decision.mobileMode !== "skip") {
    modules.push(`모바일(Android)은 ${decision.mobileMode === "implement" ? "구현" : "리뷰"}`);
  }

  return `${userRequest} 요청에 대해 ${modules.join(", ")} 모드로 참여합니다. 최종 참여 수준은 프로젝트 강제 정책과 저장소 구조를 기준으로 정해졌습니다.`;
}

function buildConsistentIntegrationNotes(decision: ManagerDecision): string[] {
  const notes: string[] = [];

  if (decision.javaMode !== "skip") {
    notes.push(`Java(Spring Boot)는 ${decision.javaMode === "implement" ? "OAuth와 JWT 발급 로직을 구현해야 합니다." : "인증 계약과 사용자 계정 연동 규칙을 검토해야 합니다."}`);
  }

  if (decision.rustMode !== "skip") {
    notes.push(`Rust(backend-fast)는 ${decision.rustMode === "implement" ? "JWT 검증과 인증 경로 변경을 구현해야 합니다." : "JWT 검증과 업로드/웹소켓 인증 경로 호환성을 검토해야 합니다."}`);
  }

  if (decision.frontendMode !== "skip") {
    notes.push(`웹 프론트엔드는 ${decision.frontendMode === "implement" ? "로그인 UI와 인증 플로우 연동을 구현해야 합니다." : "기존 로그인 흐름과의 호환성을 검토해야 합니다."}`);
  }

  if (decision.mobileMode !== "skip") {
    notes.push(`모바일(Android)은 ${decision.mobileMode === "implement" ? "앱 내 로그인과 JWT 수신 흐름을 구현해야 합니다." : "모바일 로그인 진입점과 JWT 저장/복원 흐름 영향 여부를 검토해야 합니다."}`);
  }

  return notes;
}

function buildConsistentExclusionReasons(decision: ManagerDecision): ManagerDecision["exclusionReasons"] {
  return {
    frontend: decision.frontendMode === "skip" ? decision.exclusionReasons.frontend || "이번 요청 범위에서는 프론트엔드 변경이 필요하지 않습니다." : "",
    rust: decision.rustMode === "skip" ? decision.exclusionReasons.rust || "이번 요청 범위에서는 Rust 검토가 필요하지 않습니다." : "",
    java: decision.javaMode === "skip" ? decision.exclusionReasons.java || "이번 요청 범위에서는 Java 변경이 필요하지 않습니다." : "",
    mobile: decision.mobileMode === "skip" ? decision.exclusionReasons.mobile || "이번 요청 범위에서는 모바일 변경이 필요하지 않습니다." : "",
  };
}

function makeReviewPlanConsistent(plan: SpecialistPlan): SpecialistPlan {
  if (plan.participationMode !== "review") {
    return plan;
  }

  const reviewGoal = plan.goal.includes("검토")
    ? plan.goal
    : `${plan.role} 모듈 관점에서 변경 계약과 호환성, 검증 포인트를 검토합니다.`;

  const implementationSteps = plan.implementationSteps.map((step) => {
    return step
      .replaceAll("구현", "검토")
      .replaceAll("추가", "점검")
      .replaceAll("수정", "조정");
  });

  return {
    ...plan,
    goal: reviewGoal,
    implementationSteps,
  };
}

function reconcileDecisionAndPlans(
  userRequest: string,
  decision: ManagerDecision,
  plans: Partial<Record<SpecialistRole, SpecialistPlan | undefined>>
): { decision: ManagerDecision; plans: Partial<Record<SpecialistRole, SpecialistPlan | undefined>> } {
  const reconciledDecision: ManagerDecision = {
    ...decision,
    summary: buildSummaryFromModes(userRequest, decision),
    integrationNotes: buildConsistentIntegrationNotes(decision),
    exclusionReasons: buildConsistentExclusionReasons(decision),
  };

  const reconciledPlans: Partial<Record<SpecialistRole, SpecialistPlan | undefined>> = {
    frontend: plans.frontend ? makeReviewPlanConsistent(plans.frontend) : undefined,
    rust: plans.rust ? makeReviewPlanConsistent(plans.rust) : undefined,
    java: plans.java ? makeReviewPlanConsistent(plans.java) : undefined,
    mobile: plans.mobile ? makeReviewPlanConsistent(plans.mobile) : undefined,
  };

  return {
    decision: reconciledDecision,
    plans: reconciledPlans,
  };
}

function createMockVerifierReport(state: OrchestratorStateType): VerifierReport {
  const activeRoles = [
    state.frontendPlan,
    state.rustPlan,
    state.javaPlan,
    state.mobilePlan,
  ].filter(Boolean).map((plan) => plan!.role);

  return {
    summary: `[MOCK] verifier 검토: ${activeRoles.join(", ")} 계획을 기준으로 계약 누락과 검증 범위를 점검했습니다.`,
    findings: [
      "모듈별 계획은 존재하지만, 실제 구현 전에는 JWT/env/API 계약을 최종 합의해야 합니다.",
      "참여 모듈 간 touched areas와 검증 스크립트가 요청 범위와 맞는지 다시 확인해야 합니다.",
    ],
    contractChecks: [
      "인증 요청이면 JWT_SECRET_KEY, OAuth redirect URI, 토큰 전달 방식을 확인합니다.",
      "실시간/캐시 요청이면 backend-fast와 frontend의 계약이 일치하는지 확인합니다.",
      ...buildRegistryVerifierChecks(state.userRequest),
    ],
    recommendedVerification: [
      ".skills/verify-web.ps1",
      ".skills/verify-fast.ps1",
      ".skills/verify-core.ps1",
      ".skills/verify-mobile.ps1",
      ".skills/verify-all.ps1",
    ],
    releaseBlockers: [],
  };
}

async function buildManagerDecision(
  userRequest: string,
  mock: boolean,
  repoSnapshot: RepoSnapshot
): Promise<ManagerDecision> {
  if (mock) {
    return applyMandatoryPolicies(userRequest, createMockManagerDecision(userRequest));
  }

  const model = createModel().withStructuredOutput(managerDecisionSchema);
  const rawDecision = await model.invoke([
    [
      "system",
      [
        "You are the manager agent for the Whiteboard Capture repository.",
        "Answer in Korean.",
        "Decide which specialist teams should work on the user's request.",
        "Do not implement code. Only produce orchestration decisions.",
        "Follow the mandatory project policies even if a module is only indirectly affected.",
        "Treat the markdown policy documents included in the repository snapshot keyFiles as authoritative project instructions, especially for security, architecture, coding style, and module responsibilities.",
        "Only reference files and modules that actually exist in the repository snapshot.",
        `Project context: ${JSON.stringify(projectContext)}`,
        `Repository snapshot: ${JSON.stringify(repoSnapshot)}`,
      ].join("\n"),
    ],
    ["human", userRequest],
  ]);

  return applyMandatoryPolicies(userRequest, rawDecision);
}

async function buildSpecialistPlan(
  role: SpecialistRole,
  state: OrchestratorStateType
): Promise<SpecialistPlan | undefined> {
  const decision = state.managerDecision;
  if (!decision) {
    return undefined;
  }

  if (!shouldRunRole(role, decision)) {
    return undefined;
  }

  if (state.mock) {
    return normalizeSpecialistPlan(role, createMockSpecialistPlan(role, state.userRequest), state);
  }

  const model = createModel().withStructuredOutput(specialistPlanSchema);
  const rawPlan = await model.invoke([
    [
      "system",
      [
        `You are the ${role} specialist for the Whiteboard Capture repository.`,
        "Answer in Korean.",
        "Return a concrete implementation plan for your module only.",
        "Reference project-specific verification commands and integration dependencies.",
        "Use the markdown policy documents from the repository snapshot as binding guidance for security, architecture, coding style, and module boundaries.",
        `Your participation mode is ${modeForRole(role, decision)}. If the mode is review, focus on compatibility checks and required review points instead of implementation-heavy steps.`,
        "Only mention touched areas that are present in the repository snapshot. If a needed file does not exist yet, say so in risks or implementation steps instead of inventing the path.",
        `Project context: ${JSON.stringify(projectContext)}`,
        `Repository snapshot: ${JSON.stringify(state.repoSnapshot)}`,
        `Manager decision: ${JSON.stringify(decision)}`,
      ].join("\n"),
    ],
    ["human", state.userRequest],
  ]);

  return normalizeSpecialistPlan(role, rawPlan, state);
}

async function managerNode(state: OrchestratorStateType) {
  return {
    managerDecision: await buildManagerDecision(state.userRequest, state.mock, state.repoSnapshot),
  };
}

async function frontendNode(state: OrchestratorStateType) {
  return { frontendPlan: await buildSpecialistPlan("frontend", state) };
}

async function rustNode(state: OrchestratorStateType) {
  return { rustPlan: await buildSpecialistPlan("rust", state) };
}

async function javaNode(state: OrchestratorStateType) {
  return { javaPlan: await buildSpecialistPlan("java", state) };
}

async function mobileNode(state: OrchestratorStateType) {
  return { mobilePlan: await buildSpecialistPlan("mobile", state) };
}

async function taskPacketNode(state: OrchestratorStateType) {
  const activePlans = [
    state.frontendPlan,
    state.rustPlan,
    state.javaPlan,
    state.mobilePlan,
  ].filter((plan): plan is SpecialistPlan => Boolean(plan));

  return {
    taskPackets: activePlans.map((plan) => createTaskPacketFromPlan(plan, state.userRequest)),
    workerResults: activePlans.map(createPendingWorkerResult),
  };
}

async function buildVerifierReport(state: OrchestratorStateType): Promise<VerifierReport> {
  if (state.mock) {
    return createMockVerifierReport(state);
  }

  const activePlans = [
    state.frontendPlan,
    state.rustPlan,
    state.javaPlan,
    state.mobilePlan,
  ].filter((plan): plan is SpecialistPlan => Boolean(plan));

  const model = createModel().withStructuredOutput(verifierReportSchema);
  const report = await model.invoke([
    [
      "system",
      [
        "You are the verifier agent for the Whiteboard Capture repository.",
        "Answer in Korean.",
        "Review the manager decision and specialist plans before implementation starts.",
        "Focus on contract mismatches, missing verification, hidden risks, release blockers, and whether the worker task packets are executable.",
        "Use the markdown policy documents from the repository snapshot as authoritative review criteria, especially security_guidelines.md and the module context files.",
        "Do not create new implementation plans. Only review and summarize.",
        `Project context: ${JSON.stringify(projectContext)}`,
        `Repository snapshot: ${JSON.stringify(state.repoSnapshot)}`,
        `Manager decision: ${JSON.stringify(state.managerDecision)}`,
        `Specialist plans: ${JSON.stringify(activePlans)}`,
        `Worker task packets: ${JSON.stringify(state.taskPackets ?? [])}`,
        `Worker result packets: ${JSON.stringify(state.workerResults ?? [])}`,
      ].join("\n"),
    ],
    ["human", state.userRequest],
  ]);

  return {
    ...report,
    contractChecks: Array.from(
      new Set([
        ...report.contractChecks,
        ...buildRegistryVerifierChecks(state.userRequest),
      ]),
    ),
  };
}

async function verifierNode(state: OrchestratorStateType) {
  return {
    verifierReport: await buildVerifierReport(state),
  };
}

async function mergeNode(state: OrchestratorStateType) {
  const templateCategories = detectRequestCategories(state.userRequest);
  const templateFlags = buildTemplateFlags(state.userRequest);
  const reconciled = reconcileDecisionAndPlans(state.userRequest, state.managerDecision!, {
    frontend: state.frontendPlan,
    rust: state.rustPlan,
    java: state.javaPlan,
    mobile: state.mobilePlan,
  });

  const specialistPlans = [
    reconciled.plans.frontend,
    reconciled.plans.rust,
    reconciled.plans.java,
    reconciled.plans.mobile,
  ].filter((plan): plan is SpecialistPlan => Boolean(plan));

  const lines = [
    `# Orchestration Result`,
    ``,
    `Request: ${state.userRequest}`,
    ``,
    `## Applied Templates`,
    "```yaml",
    renderAppliedTemplatesYaml(templateCategories, templateFlags),
    "```",
    ``,
    `## Manager Summary`,
    reconciled.decision.summary || "No summary available.",
    ``,
    `## Integration Notes`,
    ...reconciled.decision.integrationNotes.map((note) => `- ${note}`),
    ``,
    `## Exclusion Reasons`,
    `- frontend: ${reconciled.decision.exclusionReasons.frontend || "participating"}`,
    `- rust: ${reconciled.decision.exclusionReasons.rust || "participating"}`,
    `- java: ${reconciled.decision.exclusionReasons.java || "participating"}`,
    `- mobile: ${reconciled.decision.exclusionReasons.mobile || "participating"}`,
    ``,
    `## Specialist Plans`,
  ];

  for (const plan of specialistPlans) {
    lines.push(`### ${plan.role}`);
    lines.push(`Mode: ${plan.participationMode}`);
    lines.push(`Goal: ${plan.goal}`);
    lines.push(`Touched areas: ${plan.touchedAreas.join(", ")}`);
    lines.push(`Implementation steps:`);
    lines.push(...plan.implementationSteps.map((step) => `- ${step}`));
    lines.push(`Dependencies:`);
    lines.push(...plan.dependencies.map((dependency) => `- ${dependency}`));
    lines.push(`Verification:`);
    lines.push(...plan.verification.map((check) => `- ${check}`));
    lines.push(`Risks:`);
    lines.push(...plan.risks.map((risk) => `- ${risk}`));
    lines.push(``);
  }

  if ((state.taskPackets ?? []).length > 0) {
    lines.push(`## Worker Task Packets`);
    for (const packet of state.taskPackets ?? []) {
      lines.push(`### ${packet.role}`);
      lines.push(`Mode: ${packet.participationMode}`);
      lines.push(`Goal: ${packet.goal}`);
      lines.push(`Allowed paths: ${packet.allowedPaths.join(", ")}`);
      lines.push(`Blocked paths: ${packet.blockedPaths.join(", ")}`);
      lines.push(`Touched areas: ${packet.touchedAreas.join(", ")}`);
      lines.push(`Required verification: ${packet.requiredVerification.join(", ")}`);
      lines.push(`Contracts:`);
      lines.push(...packet.contracts.map((item) => `- ${item}`));
      lines.push(`Policy checks:`);
      lines.push(...packet.policyChecks.map((item) => `- ${item}`));
      lines.push(`Expected handoff: ${packet.handoffOutput.join(", ")}`);
      lines.push(``);
    }
  }

  if ((state.workerResults ?? []).length > 0) {
    lines.push(`## Worker Result Packets`);
    for (const result of state.workerResults ?? []) {
      lines.push(`### ${result.role}`);
      lines.push(`Status: ${result.status}`);
      lines.push(`Summary: ${result.summary}`);
      lines.push(`Changed files: ${result.changedFiles.join(", ") || "none"}`);
      lines.push(`Verification run: ${result.verificationRun.join(", ") || "none"}`);
      lines.push(`Risks:`);
      lines.push(...result.risks.map((risk) => `- ${risk}`));
      lines.push(`Questions:`);
      lines.push(...result.questions.map((question) => `- ${question}`));
      lines.push(``);
    }
  }

  if (state.verifierReport) {
    lines.push(`## Verifier Review`);
    lines.push(`Summary: ${state.verifierReport.summary}`);
    lines.push(`Findings:`);
    lines.push(...state.verifierReport.findings.map((finding) => `- ${finding}`));
    lines.push(`Contract checks:`);
    lines.push(...state.verifierReport.contractChecks.map((check) => `- ${check}`));
    lines.push(`Recommended verification:`);
    lines.push(...state.verifierReport.recommendedVerification.map((item) => `- ${item}`));
    lines.push(`Release blockers:`);
    if (state.verifierReport.releaseBlockers.length === 0) {
      lines.push(`- none`);
    } else {
      lines.push(...state.verifierReport.releaseBlockers.map((item) => `- ${item}`));
    }
    lines.push(``);
  }

  return {
    managerDecision: reconciled.decision,
    frontendPlan: reconciled.plans.frontend,
    rustPlan: reconciled.plans.rust,
    javaPlan: reconciled.plans.java,
    mobilePlan: reconciled.plans.mobile,
    taskPackets: state.taskPackets,
    workerResults: state.workerResults,
    verifierReport: state.verifierReport,
    finalReport: lines.join("\n"),
  };
}

export function createOrchestratorGraph() {
  return new StateGraph(OrchestratorState)
    // Each specialist sees the same manager decision so project-wide policies stay consistent.
    .addNode("manager", managerNode)
    .addNode("frontend", frontendNode)
    .addNode("rust", rustNode)
    .addNode("java", javaNode)
    .addNode("mobile", mobileNode)
    .addNode("task-packets", taskPacketNode)
    .addNode("verifier", verifierNode)
    .addNode("merge", mergeNode)
    .addEdge(START, "manager")
    .addEdge("manager", "frontend")
    .addEdge("frontend", "rust")
    .addEdge("rust", "java")
    .addEdge("java", "mobile")
    .addEdge("mobile", "task-packets")
    .addEdge("task-packets", "verifier")
    .addEdge("verifier", "merge")
    .addEdge("merge", END)
    .compile();
}

