import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResult, readWorkerTask } from "./packetStore.js";
import { matchesRepoPathRule, normalizeRepoRelativePath } from "./pathSafety.js";
import { applyReviewDecisionSchema, type ApplyReviewDecision } from "./reviewSchemas.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv: string[]) {
  const approveContractChanges = argv.includes("--approve-contract-changes");
  const approveOpenQuestions = argv.includes("--approve-open-questions");
  const filtered = argv.filter(
    (item) => item !== "--approve-contract-changes" && item !== "--approve-open-questions",
  );
  const [runId, role] = filtered;
  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error(
      "Usage: npm run runner:review -- <run-id> <frontend|rust|java|mobile> [--approve-contract-changes] [--approve-open-questions]",
    );
  }

  return {
    runId,
    role: role as WorkerTaskPacket["role"],
    approveContractChanges,
    approveOpenQuestions,
  };
}

function matchesPathRule(filePath: string, rule: string) {
  return matchesRepoPathRule(filePath, rule);
}

function isAllowedPath(filePath: string, task: WorkerTaskPacket) {
  return task.allowedPaths.some((rule) => matchesPathRule(filePath, rule));
}

function isBlockedPath(filePath: string, task: WorkerTaskPacket) {
  return task.blockedPaths.some((rule) => matchesPathRule(filePath, rule));
}

const dependencyManifestFiles = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "build.gradle",
  "settings.gradle",
  "gradle.properties",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
]);

const dependencySignalPatterns = [
  /\badd\s+(?:a\s+)?(?:new\s+)?dependenc(?:y|ies)\b/i,
  /\binstall\s+(?:a\s+)?(?:new\s+)?(?:package|dependenc(?:y|ies)|library)\b/i,
  /npm\s+install/i,
  /yarn\s+add/i,
  /pnpm\s+add/i,
  /\bgradle\s+dependenc/i,
  /\badd\s+crate\b/i,
  /\badd\s+(?:a\s+)?(?:new\s+)?library\b/i,
  /react-router-dom/i,
  /spring-boot-starter/i,
  /redis/i,
];

const dependencyNegationPatterns = [
  /do\s+not\s+add\s+(?:a\s+)?(?:new\s+)?dependenc(?:y|ies)/i,
  /without\s+adding\s+(?:a\s+)?(?:new\s+)?dependenc(?:y|ies)/i,
  /no\s+(?:new\s+)?dependenc(?:y|ies)/i,
];

function isDependencyManifestPath(filePath: string) {
  const normalizedPath = normalizeRepoRelativePath(filePath);
  if (!normalizedPath) {
    return false;
  }
  const baseName = normalizedPath.split("/").at(-1) ?? normalizedPath;
  return dependencyManifestFiles.has(baseName);
}

function textMentionsDependencyChange(text: string) {
  if (dependencyNegationPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  return dependencySignalPatterns.some((pattern) => pattern.test(text));
}

function editMentionsDependencyChange(edit: { summary: string; instructions: string[] }) {
  return textMentionsDependencyChange([edit.summary, ...edit.instructions].join("\n"));
}

const contractViolationRules: Array<{
  roles: WorkerTaskPacket["role"][];
  pattern: RegExp;
  reason: string;
}> = [
  {
    roles: ["frontend"],
    pattern: /nid\.naver\.com\/oauth2\.0\/authorize|VITE_NAVER_CLIENT_ID|VITE_NAVER_REDIRECT_URI/i,
    reason:
      "Frontend proposed direct Naver OAuth/client env handling, but the current auth contract routes OAuth through backend-core.",
  },
  {
    roles: ["frontend", "java"],
    pattern: /query\/fragment\/cookie|쿼리\/fragment\/cookie|쿼리\/프래그먼트\/쿠키|쿼리\/해시\/쿠키/i,
    reason:
      "Worker proposed an ambiguous JWT delivery method. Current auth contract requires the agreed token handoff or an explicit contractsChanged report.",
  },
  {
    roles: ["frontend"],
    pattern: /your-privacy-policy|example\.com|placeholder|TODO_PRIVACY|notion\.so\/your-privacy-policy/i,
    reason:
      "Frontend proposed a placeholder external URL. User-facing legal/privacy links need a real approved route or an unresolved question before apply.",
  },
];

function editText(edit: { summary: string; instructions: string[] }) {
  return [edit.summary, ...edit.instructions].join("\n");
}

function findContractViolationReasons(task: WorkerTaskPacket, edit: { summary: string; instructions: string[] }) {
  const text = editText(edit);
  return contractViolationRules
    .filter((rule) => rule.roles.includes(task.role) && rule.pattern.test(text))
    .map((rule) => rule.reason);
}

function buildDecision(
  runId: string,
  task: WorkerTaskPacket,
  result: ReturnType<typeof readWorkerResult>,
  approveContractChanges: boolean,
  approveOpenQuestions: boolean,
): ApplyReviewDecision {
  const findings: string[] = [];
  const blockedReasons: string[] = [];
  const approvedEdits: string[] = [];
  let dependencyManifestEditCount = 0;
  let dependencySignalCount = 0;

  if (result.status !== "succeeded") {
    blockedReasons.push(`Worker status is ${result.status}, not succeeded.`);
  }

  if (!result.proposedEdits || result.proposedEdits.length === 0) {
    blockedReasons.push("Worker returned no proposedEdits.");
  }

  for (const edit of result.proposedEdits ?? []) {
    const editPath = normalizeRepoRelativePath(edit.path);
    if (!editPath) {
      blockedReasons.push(`${edit.path} is not a safe repository-relative path.`);
      continue;
    }
    const allowed = isAllowedPath(editPath, task);
    const blocked = isBlockedPath(editPath, task);

    if (!allowed) {
      blockedReasons.push(`${edit.path} is outside allowed paths: ${task.allowedPaths.join(", ")}`);
    }
    if (blocked) {
      blockedReasons.push(`${edit.path} matches blocked paths: ${task.blockedPaths.join(", ")}`);
    }
    if (allowed && !blocked) {
      approvedEdits.push(editPath);
    }
    if (isDependencyManifestPath(editPath)) {
      dependencyManifestEditCount += 1;
    }
    if (editMentionsDependencyChange(edit)) {
      dependencySignalCount += 1;
    }
    for (const reason of findContractViolationReasons(task, edit)) {
      blockedReasons.push(`${edit.path}: ${reason}`);
    }
  }

  if (result.contractsChanged.length > 0) {
    if (approveContractChanges) {
      findings.push(`Contract changes explicitly approved: ${result.contractsChanged.join("; ")}`);
    } else {
      blockedReasons.push(`Worker reported contract changes: ${result.contractsChanged.join("; ")}`);
    }
  }

  if (result.questions.length > 0) {
    if (approveOpenQuestions) {
      findings.push(`Open worker questions explicitly approved: ${result.questions.length}`);
    } else {
      blockedReasons.push(
        `Worker reported ${result.questions.length} unresolved question(s). Review them and re-run with --approve-open-questions to continue intentionally.`,
      );
    }
  }

  if (dependencyManifestEditCount > 0) {
    blockedReasons.push(
      "Dependency manifest or build file edits require explicit manual approval before apply.",
    );
  }

  if (dependencySignalCount > 0 && result.contractsChanged.length === 0 && result.questions.length === 0) {
    blockedReasons.push(
      "Worker proposed or implied dependency changes without reporting contractsChanged/questions.",
    );
  }

  if (dependencySignalCount > 0 && (result.contractsChanged.length > 0 || result.questions.length > 0)) {
    findings.push("Worker reported dependency-related signals through contractsChanged/questions.");
  }

  if (task.requiredVerification.length === 0) {
    blockedReasons.push("Task has no required verification scripts.");
  }

  if (result.verificationRun.length > 0) {
    blockedReasons.push(
      "Worker result claims verificationRun before apply. Verification must be recorded by the runner after actual file changes.",
    );
  }

  if (task.policyChecks.length > 0) {
    findings.push(`Policy checks attached: ${task.policyChecks.length}`);
  }
  if (task.contracts.length > 0) {
    findings.push(`Contract constraints attached: ${task.contracts.length}`);
  }

  const uniqueBlockedReasons = Array.from(new Set(blockedReasons));
  const status = uniqueBlockedReasons.length > 0 ? "blocked" : "approved";

  return applyReviewDecisionSchema.parse({
    runId,
    role: task.role,
    status,
    summary:
      status === "approved"
        ? `${task.role} proposed edits passed path, contract, and verification gate checks.`
        : `${task.role} proposed edits are blocked before apply.`,
    findings,
    blockedReasons: uniqueBlockedReasons,
    approvedEdits: Array.from(new Set(approvedEdits)),
    requiredVerification: task.requiredVerification,
  });
}

function renderMarkdown(decision: ApplyReviewDecision) {
  const lines = [
    "# Apply Review",
    "",
    `- run_id: ${decision.runId}`,
    `- role: ${decision.role}`,
    `- status: ${decision.status}`,
    `- summary: ${decision.summary}`,
    "",
    "## Approved Edits",
  ];

  if (decision.approvedEdits.length === 0) {
    lines.push("- none");
  } else {
    for (const edit of decision.approvedEdits) {
      lines.push(`- ${edit}`);
    }
  }

  lines.push("");
  lines.push("## Blocked Reasons");
  if (decision.blockedReasons.length === 0) {
    lines.push("- none");
  } else {
    for (const reason of decision.blockedReasons) {
      lines.push(`- ${reason}`);
    }
  }

  lines.push("");
  lines.push("## Findings");
  if (decision.findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of decision.findings) {
      lines.push(`- ${finding}`);
    }
  }

  lines.push("");
  lines.push("## Required Verification");
  for (const verification of decision.requiredVerification) {
    lines.push(`- ${verification}`);
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const { runId, role, approveContractChanges, approveOpenQuestions } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const task = readWorkerTask(manifest, role);
  const result = readWorkerResult(manifest, role);

  const appliesDir = path.join(manifest.runDir, "applies");
  fs.mkdirSync(appliesDir, { recursive: true });

  const decision = buildDecision(runId, task, result, approveContractChanges, approveOpenQuestions);
  const jsonPath = path.join(appliesDir, `${role}.review.json`);
  const mdPath = path.join(appliesDir, `${role}.review.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(decision, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(decision), "utf8");

  console.log("# Apply Review");
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Status: ${decision.status}`);
  console.log(`Review: ${jsonPath}`);
  if (decision.blockedReasons.length > 0) {
    console.log("Blocked reasons:");
    for (const reason of decision.blockedReasons) {
      console.log(`- ${reason}`);
    }
  }

  if (decision.status === "blocked") {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
