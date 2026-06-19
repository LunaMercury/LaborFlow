import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResult, readWorkerResults, readWorkerTask, writeWorkerResult } from "./packetStore.js";
import { normalizeRepoRelativePath } from "./pathSafety.js";
import { estimateApiUsageCost, formatEstimatedUsd, summarizeApiUsage } from "./apiUsage.js";
import { describeOpenAIReasoning, parseOpenAIReasoningEffort } from "./openaiOptions.js";
import {
  countDisplayStatuses,
  getBlockedReasons,
  getBlockedRoles,
  getFailedRoles,
} from "./resultClassification.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import type { WorkerResultPacket } from "./resultSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type WorkerProvider = "claude" | "openai" | "manual" | "test";
type ApplyProvider = "openai" | "manual" | "test";

type Args = {
  runId: string;
  workerProvider: WorkerProvider;
  applyProvider: ApplyProvider;
  roles?: WorkerTaskPacket["role"][];
  continueOnError: boolean;
  applyReview: boolean;
  approveContractChanges: boolean;
  approveOpenQuestions: boolean;
  applyEdits: boolean;
  allowDirty: boolean;
  skipWorkers: boolean;
  reuseWorkerResults: boolean;
  verifyAll: boolean;
  skipFinalize: boolean;
  concurrency: number;
  rollbackAfterVerify: boolean;
  keepApplied: boolean;
  cleanupRuns: boolean;
  cleanupDryRun: boolean;
  compact: boolean;
  maxCostUsd?: number;
  workerModel?: string;
  applyModel?: string;
  workerReasoning?: string;
  applyReasoning?: string;
};

type QualityGateSummary = {
  status: "not run" | "passed" | "failed";
  reportPath?: string;
};

const primaryVerificationByRole: Record<WorkerTaskPacket["role"], string> = {
  frontend: ".skills/verify-web.ps1",
  rust: ".skills/verify-fast.ps1",
  java: ".skills/verify-core.ps1",
  mobile: ".skills/verify-mobile.ps1",
};

const snapshotMaxBytes = Number.parseInt(process.env.RUNNER_SNAPSHOT_MAX_BYTES || `${2 * 1024 * 1024}`, 10);
const verificationLogMaxBytes = Number.parseInt(process.env.RUNNER_VERIFICATION_LOG_MAX_BYTES || `${5 * 1024 * 1024}`, 10);
const verificationTimeoutMs = Number.parseInt(process.env.RUNNER_VERIFICATION_TIMEOUT_MS || `${10 * 60 * 1000}`, 10);

function parseArgs(argv: string[]): Args {
  let workerProvider: WorkerProvider = (process.env.WORKER_PROVIDER as WorkerProvider) || "openai";
  let applyProvider: ApplyProvider = (process.env.APPLY_PROVIDER as ApplyProvider) || "openai";
  let roles: WorkerTaskPacket["role"][] | undefined;
  const remaining: string[] = [];
  let continueOnError = false;
  let applyReview = false;
  let approveContractChanges = false;
  let approveOpenQuestions = false;
  let applyEdits = false;
  let allowDirty = false;
  let skipWorkers = false;
  let reuseWorkerResults = false;
  let verifyAll = false;
  let skipFinalize = false;
  let rollbackAfterVerify = false;
  let keepApplied = false;
  let cleanupRuns = process.env.RUNNER_AUTO_CLEANUP !== "false";
  let cleanupDryRun = false;
  let compact = false;
  let workerModel: string | undefined;
  let applyModel: string | undefined;
  let workerReasoning: string | undefined;
  let applyReasoning: string | undefined;
  let maxCostUsd = process.env.RUNNER_MAX_COST_USD
    ? Number.parseFloat(process.env.RUNNER_MAX_COST_USD)
    : undefined;
  let concurrency = Number.parseInt(process.env.RUNNER_CONCURRENCY || "1", 10);

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--worker-provider") {
      workerProvider = argv[index + 1] as WorkerProvider;
      index += 1;
      continue;
    }
    if (item === "--apply-provider") {
      applyProvider = argv[index + 1] as ApplyProvider;
      index += 1;
      continue;
    }
    if (item === "--roles") {
      roles = (argv[index + 1] ?? "")
        .split(",")
        .map((role) => role.trim())
        .filter((role): role is WorkerTaskPacket["role"] => ["frontend", "rust", "java", "mobile"].includes(role));
      index += 1;
      continue;
    }
    if (item === "--worker-model") {
      workerModel = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--apply-model") {
      applyModel = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--worker-reasoning") {
      workerReasoning = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--apply-reasoning") {
      applyReasoning = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === "--continue-on-error") {
      continueOnError = true;
      continue;
    }
    if (item === "--max-cost-usd") {
      maxCostUsd = Number.parseFloat(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (item === "--apply-review") {
      applyReview = true;
      continue;
    }
    if (item === "--approve-contract-changes") {
      approveContractChanges = true;
      continue;
    }
    if (item === "--approve-open-questions") {
      approveOpenQuestions = true;
      continue;
    }
    if (item === "--apply") {
      applyEdits = true;
      continue;
    }
    if (item === "--allow-dirty") {
      allowDirty = true;
      continue;
    }
    if (item === "--skip-workers") {
      skipWorkers = true;
      continue;
    }
    if (item === "--reuse-worker-results") {
      reuseWorkerResults = true;
      continue;
    }
    if (item === "--verify-all") {
      verifyAll = true;
      continue;
    }
    if (item === "--rollback-after-verify") {
      rollbackAfterVerify = true;
      continue;
    }
    if (item === "--keep-applied") {
      keepApplied = true;
      continue;
    }
    if (item === "--skip-cleanup") {
      cleanupRuns = false;
      continue;
    }
    if (item === "--cleanup-dry-run") {
      cleanupDryRun = true;
      continue;
    }
    if (item === "--compact" || item === "--summary-only") {
      compact = true;
      continue;
    }
    if (item === "--skip-finalize") {
      skipFinalize = true;
      continue;
    }
    if (item === "--concurrency") {
      concurrency = Number.parseInt(argv[index + 1] || "1", 10);
      index += 1;
      continue;
    }
    remaining.push(item);
  }

  const [runId] = remaining;

  if (!runId) {
    throw new Error(
      "Usage: npm run runner:workflow -- <run-id> [--worker-provider openai|claude|manual|test] [--apply-provider openai|manual|test] [--worker-model model] [--apply-model model] [--worker-reasoning minimal|low|medium|high|none] [--apply-reasoning minimal|low|medium|high|none] [--roles frontend,java] [--concurrency 2] [--max-cost-usd 0.10] [--apply] [--rollback-after-verify|--keep-applied] [--compact] [--allow-dirty] [--apply-review] [--approve-contract-changes] [--approve-open-questions] [--continue-on-error] [--skip-workers] [--reuse-worker-results] [--verify-all] [--skip-finalize] [--skip-cleanup|--cleanup-dry-run]",
    );
  }

  if (rollbackAfterVerify && !applyEdits) {
    throw new Error("--rollback-after-verify requires --apply so there are applied edits to verify and roll back.");
  }
  if (keepApplied && !applyEdits) {
    throw new Error("--keep-applied requires --apply so there are edits to preserve.");
  }
  if (rollbackAfterVerify && keepApplied) {
    throw new Error("--rollback-after-verify and --keep-applied are mutually exclusive.");
  }
  if (applyEdits && !rollbackAfterVerify && !keepApplied) {
    throw new Error("--apply requires --rollback-after-verify for a safe trial or --keep-applied for intentional permanent changes.");
  }
  if (workerReasoning) {
    parseOpenAIReasoningEffort(workerReasoning, "--worker-reasoning");
  }
  if (applyReasoning) {
    parseOpenAIReasoningEffort(applyReasoning, "--apply-reasoning");
  }
  if (maxCostUsd !== undefined && (!Number.isFinite(maxCostUsd) || maxCostUsd < 0)) {
    throw new Error("--max-cost-usd must be a non-negative number.");
  }

  return {
    runId,
    workerProvider,
    applyProvider,
    roles,
    continueOnError,
    applyReview,
    approveContractChanges,
    approveOpenQuestions,
    applyEdits,
    allowDirty,
    skipWorkers,
    reuseWorkerResults,
    verifyAll,
    skipFinalize,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 1,
    rollbackAfterVerify,
    keepApplied,
    cleanupRuns,
    cleanupDryRun,
    compact,
    maxCostUsd,
    workerModel,
    applyModel,
    workerReasoning,
    applyReasoning,
  };
}

type ChildResult = {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

const activeVerificationPids = new Set<number>();

function runNodeScript(scriptPath: string, scriptArgs: string[], cwd: string) {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

function runNodeScriptAsync(scriptPath: string, scriptArgs: string[], cwd: string): Promise<ChildResult> {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
      cwd,
      stdio: "pipe",
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let spawnError: Error | undefined;

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (status, signal) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        status,
        signal,
        error: spawnError,
      });
    });
  });
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs?: number) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
    timeout: timeoutMs,
  });
}

function terminateProcessTree(pid: number) {
  if (process.platform === "win32") {
    return spawnSync("taskkill", ["/PID", `${pid}`, "/T", "/F"], {
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }

  return undefined;
}

function terminateActiveVerificationProcesses() {
  for (const pid of activeVerificationPids) {
    terminateProcessTree(pid);
  }
}

function runCommandStreaming(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ChildResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "pipe",
      detached: process.platform !== "win32",
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let spawnError: Error | undefined;
    let timedOut = false;
    let settled = false;

    if (child.pid) {
      activeVerificationPids.add(child.pid);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      spawnError = error;
      settle(null, null, error);
    });

    function settle(status: number | null, signal: NodeJS.Signals | null, error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      if (child.pid) {
        if (process.platform === "win32") {
          terminateProcessTree(child.pid);
        }
        activeVerificationPids.delete(child.pid);
      }
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        status,
        signal,
        error,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        terminateProcessTree(child.pid);
      }
      settle(null, null, new Error(`Verification timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.on("exit", (status, signal) => {
      settle(
        status,
        signal,
        timedOut ? new Error(`Verification timed out after ${timeoutMs}ms.`) : spawnError,
      );
    });
  });
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function writeTextLimited(filePath: string, content: string, maxBytes: number) {
  const contentBuffer = Buffer.from(content, "utf8");
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || contentBuffer.byteLength <= maxBytes) {
    writeText(filePath, content);
    return {
      truncated: false,
      originalBytes: contentBuffer.byteLength,
      writtenBytes: contentBuffer.byteLength,
    };
  }

  const marker = `\n\n[truncated: original ${contentBuffer.byteLength} bytes exceeded limit ${maxBytes} bytes]\n`;
  const markerBuffer = Buffer.from(marker, "utf8");
  const sliceBytes = Math.max(0, maxBytes - markerBuffer.byteLength);
  const truncatedContent = Buffer.concat([contentBuffer.subarray(0, sliceBytes), markerBuffer]).toString("utf8");
  writeText(filePath, truncatedContent);

  return {
    truncated: true,
    originalBytes: contentBuffer.byteLength,
    writtenBytes: Buffer.byteLength(truncatedContent, "utf8"),
  };
}

function writeJson(filePath: string, data: unknown) {
  writeText(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function formatChildLog(child: ChildResult | ReturnType<typeof runNodeScript>) {
  return [
    `status: ${child.status ?? "null"}`,
    `signal: ${child.signal ?? "null"}`,
    child.error ? `error: ${child.error.message}` : undefined,
    "",
    "## stdout",
    child.stdout || "",
    "",
    "## stderr",
    child.stderr || "",
  ].filter((item): item is string => item !== undefined).join("\n");
}

function printChildOutput(child: ChildResult | ReturnType<typeof runNodeScript>, label: string) {
  if (child.stdout?.trim()) {
    console.log(child.stdout.trim());
  }
  if (child.stderr?.trim()) {
    console.error(child.stderr.trim());
  }
  if (child.error) {
    console.error(`${label} spawn error: ${child.error.message}`);
  }
  if (child.signal) {
    console.error(`${label} signal: ${child.signal}`);
  }
}

function printChildSummary(child: ChildResult | ReturnType<typeof runNodeScript>, label: string) {
  const status = child.status ?? "null";
  const signal = child.signal ? ` signal=${child.signal}` : "";
  const error = child.error ? ` error=${child.error.message}` : "";
  console.log(`${label}: exit=${status}${signal}${error}`);
  if (child.status !== 0) {
    const message = child.stderr?.trim() || child.stdout?.trim();
    if (message) {
      console.error(message.split(/\r?\n/).slice(0, 8).join("\n"));
    }
  }
}

function printWorkflowChild(child: ChildResult | ReturnType<typeof runNodeScript>, label: string, compact: boolean) {
  if (compact) {
    printChildSummary(child, label);
    return;
  }
  printChildOutput(child, label);
}

function printStreamingCompletion(child: ChildResult, label: string) {
  const status = child.status ?? "null";
  const signal = child.signal ? ` signal=${child.signal}` : "";
  const error = child.error ? ` error=${child.error.message}` : "";
  console.log(`${label}: exit=${status}${signal}${error}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results = new Map<T, R>();
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const item = items[currentIndex];
      results.set(item, await worker(item));
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runNext()));
  return results;
}

function shouldApplyRole(
  task: WorkerTaskPacket,
  proposedEditCount: number,
  applyReview: boolean,
) {
  if (proposedEditCount === 0) {
    return {
      apply: false,
      reason: "No proposed edits were returned.",
    };
  }

  if (task.participationMode === "implement") {
    return {
      apply: true,
      reason: "Implement role with proposed edits.",
    };
  }

  if (task.participationMode === "review" && applyReview) {
    return {
      apply: true,
      reason: "Review role explicitly allowed via --apply-review.",
    };
  }

  return {
    apply: false,
    reason: `Participation mode is ${task.participationMode}.`,
  };
}

function updateWorkerResultWithVerificationFailure(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
  verificationLabel: string,
  failureMessage: string,
) {
  const existing = readWorkerResult(manifest, role);
  const risks = Array.from(new Set([...existing.risks, `Verification failed: ${verificationLabel}`, failureMessage]));
  const verificationRun = Array.from(new Set([...existing.verificationRun, verificationLabel]));

  const next: WorkerResultPacket = {
    ...existing,
    status: "failed",
    summary: `${existing.summary} Verification failed during workflow.`,
    verificationRun,
    risks,
  };

  writeWorkerResult(manifest, next);
}

function updateWorkerResultWithApplyReviewFailure(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
  failureMessage: string,
) {
  const existing = readWorkerResult(manifest, role);
  const risks = Array.from(new Set([...existing.risks, `Apply review blocked: ${failureMessage}`]));

  writeWorkerResult(manifest, {
    ...existing,
    status: "failed",
    summary: `${existing.summary} Apply review blocked before file changes.`,
    risks,
  });
}

function updateWorkerResultWithQualityGateFailure(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
  failureMessage: string,
) {
  const existing = readWorkerResult(manifest, role);
  const risks = Array.from(new Set([...existing.risks, `Quality gate failed: ${failureMessage}`]));

  writeWorkerResult(manifest, {
    ...existing,
    status: "failed",
    summary: `${existing.summary} Quality gate failed after apply.`,
    risks,
  });
}

function prepareWorkerResultForReuse(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
) {
  const existing = readWorkerResult(manifest, role);
  const applyReviewRisks = existing.risks.filter((item) => item.startsWith("Apply review blocked:"));
  const verificationRisks = existing.risks.filter((item) => item.startsWith("Verification failed:"));
  const retryingApplyReviewBlock = existing.status === "failed" && applyReviewRisks.length > 0;
  const retryingVerificationFailure =
    existing.status === "failed"
    && (existing.proposedEdits?.length ?? 0) > 0
    && (verificationRisks.length > 0 || existing.summary.includes("Verification failed during workflow."));

  if (existing.status !== "succeeded" && !retryingApplyReviewBlock && !retryingVerificationFailure) {
    return;
  }

  writeWorkerResult(manifest, {
    ...existing,
    status: "succeeded",
    summary: existing.summary
      .replace(/ Apply review blocked before file changes\.$/, "")
      .replace(/ Verification failed during workflow\.$/, ""),
    verificationRun: [],
    risks: existing.risks.filter((item) => !item.startsWith("Apply review blocked:") && !item.startsWith("Verification failed:")),
  });
}

type ReuseGuard = {
  runId: string;
  createdAt: string;
  repoHead: string;
  dirtyStatus: string;
};

function getGitHead(repoRoot: string) {
  const child = runCommand("git", ["rev-parse", "HEAD"], repoRoot);
  if (child.status !== 0) {
    throw new Error(child.stderr?.trim() || child.stdout?.trim() || "git rev-parse HEAD failed");
  }
  return child.stdout.trim();
}

function isGitWorktree(repoRoot: string) {
  const child = runCommand("git", ["rev-parse", "--is-inside-work-tree"], repoRoot);
  return child.status === 0 && child.stdout.trim() === "true";
}

function getReuseGuardPath(manifest: ReturnType<typeof readRunnerManifest>) {
  return path.join(getWorkflowDirs(manifest).metaDir, "reuse-guard.json");
}

function buildReuseGuard(manifest: ReturnType<typeof readRunnerManifest>): ReuseGuard {
  return {
    runId: manifest.runId,
    createdAt: new Date().toISOString(),
    repoHead: getGitHead(manifest.repoRoot),
    dirtyStatus: getDirtyWorktreeOutput(manifest.repoRoot),
  };
}

function writeReuseGuard(manifest: ReturnType<typeof readRunnerManifest>) {
  writeJson(getReuseGuardPath(manifest), buildReuseGuard(manifest));
}

function tryWriteReuseGuard(manifest: ReturnType<typeof readRunnerManifest>) {
  if (!isGitWorktree(manifest.repoRoot)) {
    console.warn(
      [
        "Reuse guard warning: git worktree is not initialized.",
        "This is allowed for dry-runs in a package rehearsal before git init.",
        "Reusing worker results will remain unavailable until the project is a git worktree.",
      ].join("\n"),
    );
    return;
  }

  try {
    writeReuseGuard(manifest);
  } catch (error) {
    console.warn(
      [
        "Reuse guard warning: could not record git state for this run.",
        "This is allowed for dry-runs in a package rehearsal before git init.",
        "Reusing worker results will remain unavailable until the project is a git worktree.",
        error instanceof Error ? error.message : String(error),
      ].join("\n"),
    );
  }
}

function readReuseGuard(manifest: ReturnType<typeof readRunnerManifest>): ReuseGuard {
  const guardPath = getReuseGuardPath(manifest);
  if (!fs.existsSync(guardPath)) {
    throw new Error(
      [
        "Cannot reuse worker results because this run has no reuse guard metadata.",
        "Re-run workers once with the current pipeline version before using --reuse-worker-results.",
      ].join("\n"),
    );
  }
  return JSON.parse(fs.readFileSync(guardPath, "utf8")) as ReuseGuard;
}

function assertReuseGuardMatchesCurrentRepo(manifest: ReturnType<typeof readRunnerManifest>) {
  const guard = readReuseGuard(manifest);
  const current = buildReuseGuard(manifest);
  const failures: string[] = [];

  if (guard.runId !== manifest.runId) {
    failures.push(`run id mismatch: guard=${guard.runId}, current=${manifest.runId}`);
  }
  if (guard.repoHead !== current.repoHead) {
    failures.push(`git HEAD changed: guard=${guard.repoHead}, current=${current.repoHead}`);
  }
  if (guard.dirtyStatus !== current.dirtyStatus) {
    failures.push("git worktree status changed since worker results were produced");
  }

  if (failures.length > 0) {
    throw new Error(
      [
        "Refusing to reuse worker results because the repository state changed.",
        ...failures.map((failure) => `- ${failure}`),
        "Re-run workers so proposed edits are based on the current code state.",
      ].join("\n"),
    );
  }
}

function isRetryableApplyReviewFailure(result: WorkerResultPacket) {
  return result.status === "failed" && result.risks.some((item) => item.startsWith("Apply review blocked:"));
}

function isRetryableVerificationFailure(result: WorkerResultPacket) {
  return (
    result.status === "failed"
    && (result.proposedEdits?.length ?? 0) > 0
    && (
      result.risks.some((item) => item.startsWith("Verification failed:"))
      || result.summary.includes("Verification failed during workflow.")
    )
  );
}

function assertWorkerResultReusable(
  task: WorkerTaskPacket,
  result: WorkerResultPacket,
  options: {
    applyEdits: boolean;
    approveContractChanges: boolean;
    approveOpenQuestions: boolean;
  },
) {
  const failures: string[] = [];
  const proposedEdits = result.proposedEdits ?? [];

  if (result.role !== task.role) {
    failures.push(`result role ${result.role} does not match task role ${task.role}`);
  }

  if (result.status === "pending" || result.status === "running") {
    failures.push(`worker result status is ${result.status}`);
  }

  if (result.status === "failed" && !isRetryableApplyReviewFailure(result) && !isRetryableVerificationFailure(result)) {
    failures.push("failed worker result is not a retryable apply-review or verification failure");
  }

  if (options.applyEdits && result.status === "failed" && proposedEdits.length === 0) {
    failures.push("failed worker result has no proposedEdits to retry");
  }

  if (options.applyEdits && result.contractsChanged.length > 0 && !options.approveContractChanges) {
    failures.push("worker result reports contractsChanged; re-run with --approve-contract-changes only after manual review");
  }

  if (options.applyEdits && result.questions.length > 0 && !options.approveOpenQuestions) {
    failures.push("worker result has unresolved questions; re-run with --approve-open-questions only after manual review");
  }

  for (const edit of proposedEdits) {
    if (!normalizeRepoRelativePath(edit.path)) {
      failures.push(`proposed edit path is unsafe: ${edit.path}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        `Refusing to reuse worker result for ${task.role}.`,
        ...failures.map((failure) => `- ${failure}`),
      ].join("\n"),
    );
  }

  const notes: string[] = [];
  if (result.status === "skipped") {
    notes.push(`${task.role}: worker result is skipped; apply will be skipped.`);
  } else if (options.applyEdits && proposedEdits.length === 0) {
    notes.push(`${task.role}: worker result has no proposedEdits; apply will be skipped.`);
  } else if (result.status === "failed") {
    notes.push(`${task.role}: retrying previously failed apply/verification using existing proposedEdits.`);
  }

  for (const note of notes) {
    console.log(`Reuse guard: ${note}`);
  }
}

async function runVerificationScript(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
  verificationScript: string,
  logFile?: string,
) {
  const child = await runCommandStreaming(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", verificationScript],
    manifest.repoRoot,
    verificationTimeoutMs,
  );

  printStreamingCompletion(child, `verify ${role}`);

  if (child.status !== 0) {
    const failureMessage =
      child.stderr?.trim() ||
      child.stdout?.trim() ||
      `verification exited with code ${child.status ?? "unknown"}`;
    updateWorkerResultWithVerificationFailure(manifest, role, verificationScript, failureMessage);
  } else {
    const existing = readWorkerResult(manifest, role);
    const verificationRun = Array.from(new Set([...existing.verificationRun, verificationScript]));
    writeWorkerResult(manifest, {
      ...existing,
      verificationRun,
    });
  }

  return child;
}

function getWorkflowVerificationScripts(role: WorkerTaskPacket["role"]) {
  return [primaryVerificationByRole[role]];
}

function updateWorkerResultWithVerificationSuccess(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: WorkerTaskPacket["role"],
  verificationLabel: string,
) {
  const existing = readWorkerResult(manifest, role);
  const verificationRun = Array.from(new Set([...existing.verificationRun, verificationLabel]));
  writeWorkerResult(manifest, {
    ...existing,
    verificationRun,
  });
}

function getDirtyWorktreeOutput(repoRoot: string) {
  const child = runCommand("git", ["status", "--porcelain"], repoRoot);
  if (child.status !== 0) {
    throw new Error(child.stderr?.trim() || child.stdout?.trim() || "git status failed");
  }

  return child.stdout.trim();
}

function getWorkflowDirs(manifest: ReturnType<typeof readRunnerManifest>) {
  return {
    snapshotsDir: path.join(manifest.runDir, "snapshots"),
    verificationDir: path.join(manifest.runDir, "verification"),
    metaDir: path.join(manifest.runDir, "meta"),
  };
}

function runRelativePath(manifest: ReturnType<typeof readRunnerManifest>, filePath: string) {
  return path.relative(manifest.runDir, filePath).replaceAll("\\", "/");
}

function renderAddedFileDiff(repoRoot: string, repoRelativePath: string) {
  const fullPath = path.join(repoRoot, repoRelativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return "";
  }

  const content = fs.readFileSync(fullPath, "utf8");
  const normalizedPath = repoRelativePath.replaceAll("\\", "/");
  const lines = content.split(/\r?\n/);
  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${normalizedPath}`,
    "@@",
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function renderUntrackedDiff(repoRoot: string, statusOutput: string) {
  return statusOutput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((repoRelativePath) => renderAddedFileDiff(repoRoot, repoRelativePath))
    .filter(Boolean)
    .join("\n");
}

function captureGitSnapshot(
  manifest: ReturnType<typeof readRunnerManifest>,
  name: string,
  pathspecs: string[] = [],
) {
  const { snapshotsDir } = getWorkflowDirs(manifest);
  const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const args = ["diff", "--binary", "--", ...pathspecs];
  const diff = runCommand("git", args, manifest.repoRoot);
  const statusArgs = pathspecs.length > 0
    ? ["status", "--porcelain", "--", ...pathspecs]
    : ["status", "--porcelain"];
  const status = runCommand("git", statusArgs, manifest.repoRoot);
  const untrackedDiff = renderUntrackedDiff(manifest.repoRoot, status.stdout || "");
  const combinedDiff = [diff.stdout || "", untrackedDiff].filter((item) => item.trim()).join("\n");

  const diffPath = path.join(snapshotsDir, `${safeName}.diff`);
  const statusPath = path.join(snapshotsDir, `${safeName}.status.txt`);
  const diffWrite = writeTextLimited(diffPath, combinedDiff, snapshotMaxBytes);
  const statusWrite = writeTextLimited(statusPath, status.stdout || "", snapshotMaxBytes);

  return {
    diffPath,
    statusPath,
    diffStatus: diff.status,
    statusStatus: status.status,
    diffWrite,
    statusWrite,
  };
}

function getPathStatus(repoRoot: string, pathspecs: string[]) {
  const args = pathspecs.length > 0
    ? ["status", "--porcelain", "--", ...pathspecs]
    : ["status", "--porcelain"];
  const child = runCommand("git", args, repoRoot);
  if (child.status !== 0) {
    throw new Error(child.stderr?.trim() || child.stdout?.trim() || "git status failed");
  }

  return child.stdout.trim();
}

function getRollbackScopePathspecs(
  manifest: ReturnType<typeof readRunnerManifest>,
  workers: ReturnType<typeof readRunnerManifest>["workers"],
) {
  return Array.from(new Set(
    workers.flatMap((worker) => {
      const task = readWorkerTask(manifest, worker.role);
      return task.allowedPaths.map((rule) => {
        const scope = rule.replaceAll("\\", "/").replace(/\/\*\*?$/, "");
        const normalized = normalizeRepoRelativePath(scope);
        if (!normalized) {
          throw new Error(`Unsafe allowed path rule for rollback scope: ${rule}`);
        }
        return normalized;
      });
    }),
  ));
}

function getTrackedPaths(repoRoot: string, pathspecs: string[]) {
  if (pathspecs.length === 0) {
    return [];
  }

  const child = runCommand("git", ["ls-files", "--", ...pathspecs], repoRoot);
  if (child.status !== 0) {
    throw new Error(child.stderr?.trim() || child.stdout?.trim() || "git ls-files failed");
  }

  return child.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rollbackWorktree(manifest: ReturnType<typeof readRunnerManifest>, pathspecs: string[]) {
  const uniquePathspecs = Array.from(new Set(pathspecs)).filter(Boolean);
  if (uniquePathspecs.length === 0) {
    return {
      restore: { stdout: "", stderr: "", status: 0, signal: null } as ReturnType<typeof runCommand>,
      clean: { stdout: "", stderr: "", status: 0, signal: null } as ReturnType<typeof runCommand>,
      finalStatus: "",
      succeeded: true,
    };
  }

  const trackedPaths = getTrackedPaths(manifest.repoRoot, uniquePathspecs);
  const restore = trackedPaths.length > 0
    ? runCommand("git", ["restore", "--worktree", "--staged", "--", ...trackedPaths], manifest.repoRoot)
    : ({ stdout: "", stderr: "", status: 0, signal: null } as ReturnType<typeof runCommand>);
  const clean = uniquePathspecs.length > 0
    ? runCommand("git", ["clean", "-fd", "--", ...uniquePathspecs], manifest.repoRoot)
    : ({ stdout: "", stderr: "", status: 0, signal: null } as ReturnType<typeof runCommand>);
  const finalStatus = getPathStatus(manifest.repoRoot, uniquePathspecs);

  return {
    restore,
    clean,
    finalStatus,
    succeeded: restore.status === 0 && clean.status === 0 && finalStatus.length === 0,
  };
}

function formatStatusCounts(statusCounts: Record<string, number>) {
  const preferredOrder = ["succeeded", "skipped", "blocked", "failed", "pending", "running"];
  return preferredOrder
    .filter((status) => statusCounts[status])
    .map((status) => `${status}=${statusCounts[status]}`)
    .join(", ") || "none";
}

function formatRolesArg(roles: WorkerTaskPacket["role"][]) {
  return roles.join(",");
}

function buildNextActionLines(args: {
  manifest: ReturnType<typeof readRunnerManifest>;
  targetRoles: WorkerTaskPacket["role"][];
  finalStatus: string;
  blockedRoles: WorkerTaskPacket["role"][];
  failedRoles: WorkerTaskPacket["role"][];
  appliedRoles: Set<WorkerTaskPacket["role"]>;
  rollbackStatus: string;
  verificationStatus: string;
}) {
  const lines: string[] = [];

  if (args.finalStatus === "blocked") {
    lines.push("Review the blocked reason in the report, then either refine the request or explicitly approve the open question/contract change.");
    lines.push(`Inspect options: npm run runner:continue -- ${args.manifest.runId}`);
    lines.push(`If the question is acceptable, preview approval path: npm run runner:continue -- ${args.manifest.runId} --choose B`);
    lines.push(`Execute approval path intentionally: npm run runner:continue -- ${args.manifest.runId} --choose B --execute`);
    return lines;
  }

  if (args.finalStatus === "failed") {
    lines.push("Open the report first and inspect the failed worker/apply/verification section before retrying.");
    if (args.failedRoles.length > 0) {
      lines.push(`Inspect retry options: npm run runner:continue -- ${args.manifest.runId}`);
      lines.push(`Retry without new worker calls when proposed edits exist: npm run runner:continue -- ${args.manifest.runId} --choose B --execute`);
    }
    return lines;
  }

  if (args.rollbackStatus === "succeeded" && args.appliedRoles.size > 0) {
    lines.push("Rehearsal passed and rollback succeeded; no files were kept.");
    lines.push(`Preview keep-applied path: npm run runner:continue -- ${args.manifest.runId} --choose B`);
    lines.push(`Keep the same worker result intentionally: npm run runner:continue -- ${args.manifest.runId} --choose B --execute`);
    return lines;
  }

  if (args.appliedRoles.size > 0) {
    lines.push("Applied edits are still in the worktree. Review diff, run any needed verification, then commit.");
    lines.push("Suggested checks: git diff --stat && git status --short");
    return lines;
  }

  if (args.verificationStatus === "none") {
    lines.push("No files were applied. Review worker proposals in the report, then run runner:rehearse or runner:apply when ready.");
    lines.push(`Inspect reusable options: npm run runner:continue -- ${args.manifest.runId}`);
    lines.push(`Safe rehearsal when proposed edits exist: npm run runner:continue -- ${args.manifest.runId} --choose A --execute`);
    return lines;
  }

  lines.push("Review the report and continue with the next role or verification step.");
  return lines;
}

function printFinalTerminalSummary(
  manifest: ReturnType<typeof readRunnerManifest>,
  targetRoles: WorkerTaskPacket["role"][],
  workflowExitCode: number,
  appliedRoles: Set<WorkerTaskPacket["role"]>,
  rollbackSummary: {
    enabled: boolean;
    verificationLogs?: Array<{
      role: WorkerTaskPacket["role"] | "all";
      script: string;
      status: number | null;
    }>;
    rollback?: {
      restoreStatus: number | null;
      cleanStatus: number | null;
      finalWorktreeClean: boolean;
      finalStatus: string;
    };
  },
  cleanupStatus: number | null,
  qualityGate: QualityGateSummary,
) {
  const targetRoleSet = new Set(targetRoles);
  const results = readWorkerResults(manifest).filter((result) => targetRoleSet.has(result.role));
  const statusCounts = countDisplayStatuses(results);
  const blockedRoles = getBlockedRoles(results);
  const failedRoles = getFailedRoles(results);
  const blockedReasons = getBlockedReasons(results);
  const changedFiles = results.reduce((sum, result) => sum + result.changedFiles.length, 0);
  const proposedEdits = results.reduce((sum, result) => sum + (result.proposedEdits?.length ?? 0), 0);
  const apiUsage = summarizeApiUsage(manifest);
  const apiCost = estimateApiUsageCost(apiUsage);
  const verificationRun = Array.from(new Set(results.flatMap((result) => result.verificationRun)));
  const verificationLogs = rollbackSummary.verificationLogs ?? [];
  const verificationFailed = verificationLogs.some((log) => log.status !== 0);
  const verificationStatus = verificationLogs.length > 0
    ? verificationFailed
      ? "failed"
      : "passed"
    : verificationRun.length > 0
      ? "recorded"
      : "none";
  const rollbackStatus = !rollbackSummary.enabled
    ? "not requested"
    : rollbackSummary.rollback?.finalWorktreeClean
      ? "succeeded"
      : "failed";
  const cleanupFailed = cleanupStatus !== null && cleanupStatus !== 0;
  const rollbackFailed = rollbackSummary.enabled && rollbackStatus !== "succeeded";
  const finalStatus = workflowExitCode === 0
    ? "succeeded"
    : blockedRoles.length > 0 && failedRoles.length === 0 && !verificationFailed && !rollbackFailed && !cleanupFailed
      ? "blocked"
      : "failed";

  console.log("");
  console.log("## Final Summary");
  console.log(`Status: ${finalStatus}`);
  console.log(`Workers: ${formatStatusCounts(statusCounts)}`);
  if (blockedRoles.length > 0) {
    console.log(`Blocked roles: ${blockedRoles.join(", ")}`);
  }
  console.log(`Applied roles: ${[...appliedRoles].join(", ") || "none"}`);
  console.log(`Changed files recorded: ${changedFiles}`);
  console.log(`Proposed edits: ${proposedEdits}`);
  console.log(`API usage: calls=${apiUsage.calls}, total_tokens=${apiUsage.totalTokens}, input_tokens=${apiUsage.inputTokens}, output_tokens=${apiUsage.outputTokens}`);
  console.log(`API cost: estimated_usd=${formatEstimatedUsd(apiCost.estimatedUsd)}, priced_calls=${apiCost.pricedCalls}, unpriced_calls=${apiCost.unpricedCalls}`);
  if (apiCost.unpricedModels.length > 0) {
    console.log(`API cost warning: missing price for ${apiCost.unpricedModels.join(", ")}`);
  }
  console.log(`Verification: ${verificationStatus}${verificationRun.length > 0 ? ` (${verificationRun.join(", ")})` : ""}`);
  console.log(`Quality gate: ${qualityGate.status}${qualityGate.reportPath ? ` (${qualityGate.reportPath})` : ""}`);
  console.log(`Rollback: ${rollbackStatus}`);
  console.log(`Cleanup: ${cleanupStatus === null ? "not run" : cleanupStatus === 0 ? "succeeded" : `failed(${cleanupStatus})`}`);
  if (blockedReasons.length > 0) {
    console.log(`Reason: ${blockedReasons.join(" | ")}`);
  }
  const nextActionLines = buildNextActionLines({
    manifest,
    targetRoles,
    finalStatus,
    blockedRoles,
    failedRoles,
    appliedRoles,
    rollbackStatus,
    verificationStatus,
  });
  console.log("Next action:");
  for (const line of nextActionLines) {
    console.log(`- ${line}`);
  }
  console.log(`Report: ${manifest.reportPath}`);
  console.log(`HTML report: ${path.join(manifest.runDir, "report.html")}`);
}

function assertCostBudget(
  manifest: ReturnType<typeof readRunnerManifest>,
  maxCostUsd: number | undefined,
  context: string,
) {
  if (maxCostUsd === undefined) {
    return;
  }

  const apiUsage = summarizeApiUsage(manifest);
  const apiCost = estimateApiUsageCost(apiUsage);
  if (apiCost.estimatedUsd <= maxCostUsd) {
    return;
  }

  throw new Error(
    [
      `API cost budget exceeded before ${context}.`,
      `estimated_usd=${formatEstimatedUsd(apiCost.estimatedUsd)}, max_cost_usd=${formatEstimatedUsd(maxCostUsd)}`,
      "No further apply steps were run. Re-run with a higher --max-cost-usd only after reviewing the report.",
    ].join("\n"),
  );
}

async function main() {
  const { runId, workerProvider, applyProvider, roles, continueOnError, applyReview, approveContractChanges, approveOpenQuestions, applyEdits, allowDirty, skipWorkers, reuseWorkerResults, verifyAll, skipFinalize, concurrency, rollbackAfterVerify, keepApplied, cleanupRuns, cleanupDryRun, compact, maxCostUsd, workerModel, applyModel, workerReasoning, applyReasoning } = parseArgs(
    process.argv.slice(2),
  );
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);

  if (workerModel) {
    process.env.OPENAI_WORKER_MODEL = workerModel;
  }
  if (applyModel) {
    process.env.OPENAI_APPLY_MODEL = applyModel;
  }
  if (workerReasoning) {
    process.env.OPENAI_WORKER_REASONING = workerReasoning;
  }
  if (applyReasoning) {
    process.env.OPENAI_APPLY_REASONING = applyReasoning;
  }

  const targetWorkers = manifest.workers.filter((worker) => !roles || roles.includes(worker.role));
  if (targetWorkers.length === 0) {
    throw new Error("No workers matched the requested roles.");
  }

  if (applyEdits && !allowDirty) {
    const dirtyOutput = getDirtyWorktreeOutput(manifest.repoRoot);
    if (dirtyOutput) {
      throw new Error(
        [
          "Refusing to apply worker edits because the git worktree is not clean.",
          "Commit, stash, or revert existing changes first, or re-run with --allow-dirty if you intentionally want to apply on top of them.",
          "",
          dirtyOutput,
        ].join("\n"),
      );
    }
  }
  if (applyEdits && rollbackAfterVerify && allowDirty) {
    const rollbackScopes = getRollbackScopePathspecs(manifest, targetWorkers);
    const dirtyTargetOutput = getPathStatus(manifest.repoRoot, rollbackScopes);
    if (dirtyTargetOutput) {
      throw new Error(
        [
          "Refusing rollback trial because target module scopes already contain changes.",
          "--allow-dirty may only be used when pre-existing edits are outside worker target scopes.",
          "",
          dirtyTargetOutput,
        ].join("\n"),
      );
    }
  }

  console.log("# Runner Workflow");
  console.log(`Run ID: ${runId}`);
  console.log(`Worker provider: ${workerProvider}`);
  console.log(`Apply provider: ${applyProvider}`);
  const effectiveWorkerModel = process.env.OPENAI_WORKER_MODEL || "gpt-4.1";
  const effectiveApplyModel = process.env.OPENAI_APPLY_MODEL || process.env.OPENAI_WORKER_MODEL || "gpt-4.1";
  const requestedWorkerReasoning = process.env.OPENAI_WORKER_REASONING;
  const requestedApplyReasoning = process.env.OPENAI_APPLY_REASONING || process.env.OPENAI_WORKER_REASONING;
  console.log(`Worker model: ${effectiveWorkerModel}`);
  console.log(`Apply model: ${effectiveApplyModel}`);
  console.log(`Worker reasoning: ${describeOpenAIReasoning(effectiveWorkerModel, requestedWorkerReasoning)}`);
  console.log(`Apply reasoning: ${describeOpenAIReasoning(effectiveApplyModel, requestedApplyReasoning)}`);
  console.log(`Workers: ${targetWorkers.map((item) => item.role).join(", ")}`);
  console.log(`Apply edits: ${applyEdits ? "yes" : "no"}`);
  console.log(`Allow dirty worktree: ${allowDirty ? "yes" : "no"}`);
  console.log(`Apply review roles: ${applyReview ? "yes" : "no"}`);
  console.log(`Approve contract changes: ${approveContractChanges ? "yes" : "no"}`);
  console.log(`Approve open questions: ${approveOpenQuestions ? "yes" : "no"}`);
  console.log(`Skip workers/apply: ${skipWorkers ? "yes" : "no"}`);
  console.log(`Reuse worker results: ${reuseWorkerResults ? "yes" : "no"}`);
  console.log(`Verify all: ${verifyAll ? "yes" : "no"}`);
  console.log(`Worker concurrency: ${concurrency}`);
  console.log(`Rollback after verify: ${rollbackAfterVerify ? "yes" : "no"}`);
  console.log(`Keep applied edits: ${keepApplied ? "yes" : "no"}`);
  console.log(`Cleanup runs: ${cleanupRuns ? "yes" : "no"}`);
  console.log(`Cleanup dry run: ${cleanupDryRun ? "yes" : "no"}`);
  console.log(`Max API cost: ${maxCostUsd === undefined ? "unlimited" : formatEstimatedUsd(maxCostUsd)}`);
  console.log(`Compact output: ${compact ? "yes" : "no"}`);
  console.log("");

  if (!skipWorkers && reuseWorkerResults) {
    assertReuseGuardMatchesCurrentRepo(manifest);
    for (const worker of targetWorkers) {
      const task = readWorkerTask(manifest, worker.role);
      const result = readWorkerResult(manifest, worker.role);
      assertWorkerResultReusable(task, result, {
        applyEdits,
        approveContractChanges,
        approveOpenQuestions,
      });
    }
  } else if (!skipWorkers) {
    tryWriteReuseGuard(manifest);
  }

  const rollbackSummary: {
    enabled: boolean;
    snapshots: Array<{ label: string; diffPath: string; statusPath: string; diffTruncated: boolean; statusTruncated: boolean }>;
    verificationLogs: Array<{ role: WorkerTaskPacket["role"] | "all"; script: string; logPath: string; status: number | null; truncated: boolean }>;
    rollback?: {
      restoreStatus: number | null;
      cleanStatus: number | null;
      finalWorktreeClean: boolean;
      finalStatus: string;
    };
  } = {
    enabled: rollbackAfterVerify,
    snapshots: [],
    verificationLogs: [],
  };
  let workflowExitCode = 0;
  const rollbackPathspecs: string[] = [];
  const appliedRoles = new Set<WorkerTaskPacket["role"]>();
  let rollbackCompleted = false;
  let cleanupStatus: number | null = null;
  let qualityGate: QualityGateSummary = { status: "not run" };

  function performRollback() {
    if (!rollbackAfterVerify || rollbackCompleted) {
      return;
    }

    console.log("## Rolling back applied edits");
    const finalSnapshot = captureGitSnapshot(manifest, "after-verification-before-rollback");
    rollbackSummary.snapshots.push({
      label: "after-verification-before-rollback",
      diffPath: runRelativePath(manifest, finalSnapshot.diffPath),
      statusPath: runRelativePath(manifest, finalSnapshot.statusPath),
      diffTruncated: finalSnapshot.diffWrite.truncated,
      statusTruncated: finalSnapshot.statusWrite.truncated,
    });

    const rollback = rollbackWorktree(manifest, rollbackPathspecs);
    printWorkflowChild(rollback.restore, "rollback restore", compact);
    printWorkflowChild(rollback.clean, "rollback clean", compact);
    rollbackSummary.rollback = {
      restoreStatus: rollback.restore.status,
      cleanStatus: rollback.clean.status,
      finalWorktreeClean: rollback.succeeded,
      finalStatus: rollback.finalStatus,
    };
    writeJson(path.join(getWorkflowDirs(manifest).metaDir, "rollback-summary.json"), rollbackSummary);
    rollbackCompleted = true;

    console.log(`Rollback status: ${rollback.succeeded ? "succeeded" : "failed"}`);
    console.log(`Rollback summary: ${path.join(getWorkflowDirs(manifest).metaDir, "rollback-summary.json")}`);
    if (!rollback.succeeded) {
      console.error(rollback.finalStatus || "Rollback failed but no git status output was available.");
      workflowExitCode = workflowExitCode || 1;
    }
    console.log("");
  }

  function handleTermination(signal: NodeJS.Signals) {
    console.error(`Received ${signal}. Attempting rollback before exit.`);
    try {
      terminateActiveVerificationProcesses();
      performRollback();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    process.exit(workflowExitCode || 130);
  }

  process.once("SIGINT", handleTermination);
  process.once("SIGTERM", handleTermination);

  if (rollbackAfterVerify) {
    const beforeSnapshot = captureGitSnapshot(manifest, "before-apply");
    rollbackSummary.snapshots.push({
      label: "before-apply",
      diffPath: runRelativePath(manifest, beforeSnapshot.diffPath),
      statusPath: runRelativePath(manifest, beforeSnapshot.statusPath),
      diffTruncated: beforeSnapshot.diffWrite.truncated,
      statusTruncated: beforeSnapshot.statusWrite.truncated,
    });
  }

  try {
  if (skipWorkers) {
    console.log("## Worker/apply stage skipped");
    console.log("Using existing worker result packets for verification and finalization.");
    console.log("");
  } else {
    const workerRuns = reuseWorkerResults
      ? new Map()
      : await mapWithConcurrency(targetWorkers, concurrency, async (worker) => {
          console.log(`## Worker ${worker.role}`);
          const workerRun = await runNodeScriptAsync(
            path.join("src", "workerRun.ts"),
            [runId, worker.role, "--provider", workerProvider],
            orchestratorRoot,
          );
          printWorkflowChild(workerRun, `worker ${worker.role}`, compact);
          return workerRun;
        });

    if (reuseWorkerResults) {
      console.log("## Reusing worker result packets");
      console.log("Skipping worker API calls and continuing with apply review.");
      console.log("");
      for (const worker of targetWorkers) {
        prepareWorkerResultForReuse(manifest, worker.role);
      }
    }

    for (const worker of targetWorkers) {
      if (!reuseWorkerResults) {
        const workerRun = workerRuns.get(worker);
        if (!workerRun) {
          throw new Error(`Worker result missing for ${worker.role}`);
        }
      if (workerRun.status !== 0) {
        console.error(`worker ${worker.role} failed with exit code ${workerRun.status}`);
        workflowExitCode = workflowExitCode || workerRun.status || 1;
        if (!continueOnError) {
            if (rollbackAfterVerify) {
              workflowExitCode = workerRun.status ?? 1;
              console.log("");
              continue;
            }
            process.exit(workerRun.status ?? 1);
          }
          console.log("");
          continue;
        }
      }

      const task = readWorkerTask(manifest, worker.role);
      const result = readWorkerResult(manifest, worker.role);
      const applyDecision = shouldApplyRole(task, result.proposedEdits?.length ?? 0, applyReview);

      if (result.status !== "succeeded") {
        console.log(`Skipping apply for ${worker.role}: worker status is ${result.status}.`);
        console.log("");
        continue;
      }

      if (!applyEdits) {
        console.log(`Skipping apply for ${worker.role}: apply is disabled by default. Re-run with --apply to modify files.`);
        console.log("");
        continue;
      }

      if (!applyDecision.apply) {
        console.log(`Skipping apply for ${worker.role}: ${applyDecision.reason}`);
        console.log("");
        continue;
      }

      assertCostBudget(manifest, maxCostUsd, `${worker.role} apply review`);
      console.log(`Reviewing apply safety for ${worker.role}.`);
      const applyReviewRun = runNodeScript(
        path.join("src", "applyReview.ts"),
        [
          runId,
          worker.role,
          ...(approveContractChanges ? ["--approve-contract-changes"] : []),
          ...(approveOpenQuestions ? ["--approve-open-questions"] : []),
        ],
        orchestratorRoot,
      );
      printWorkflowChild(applyReviewRun, `apply:review ${worker.role}`, compact);

      if (applyReviewRun.status !== 0) {
        console.error(`apply:review ${worker.role} blocked or failed with exit code ${applyReviewRun.status}`);
        workflowExitCode = workflowExitCode || applyReviewRun.status || 1;
        const failureMessage =
          applyReviewRun.stderr?.trim() ||
          applyReviewRun.stdout?.trim() ||
          `apply review exited with code ${applyReviewRun.status ?? "unknown"}`;
        updateWorkerResultWithApplyReviewFailure(manifest, worker.role, failureMessage);
        if (!continueOnError) {
          if (rollbackAfterVerify) {
            workflowExitCode = applyReviewRun.status ?? 1;
            console.log("");
            continue;
          }
          process.exit(applyReviewRun.status ?? 1);
        }
        console.log("");
        continue;
      }

      assertCostBudget(manifest, maxCostUsd, `${worker.role} apply preparation`);
      console.log(`Preparing apply for ${worker.role}: ${applyDecision.reason}`);
      const applyPrepare = runNodeScript(
        path.join("src", "applyExecutor.ts"),
        [runId, worker.role],
        orchestratorRoot,
      );
      printWorkflowChild(applyPrepare, `apply:prepare ${worker.role}`, compact);

      if (applyPrepare.status !== 0) {
        console.error(`apply:prepare ${worker.role} failed with exit code ${applyPrepare.status}`);
        workflowExitCode = workflowExitCode || applyPrepare.status || 1;
        if (!continueOnError) {
          if (rollbackAfterVerify) {
            workflowExitCode = applyPrepare.status ?? 1;
            console.log("");
            continue;
          }
          process.exit(applyPrepare.status ?? 1);
        }
        console.log("");
        continue;
      }

      assertCostBudget(manifest, maxCostUsd, `${worker.role} apply run`);
      const applyRun = runNodeScript(
        path.join("src", "applyRun.ts"),
        [
          runId,
          worker.role,
          "--provider",
          applyProvider,
          ...(approveOpenQuestions ? ["--approve-open-questions"] : []),
        ],
        orchestratorRoot,
      );
      printWorkflowChild(applyRun, `apply:run ${worker.role}`, compact);

      if (applyRun.status !== 0) {
        console.error(`apply:run ${worker.role} failed with exit code ${applyRun.status}`);
        workflowExitCode = workflowExitCode || applyRun.status || 1;
        if (!continueOnError) {
          if (rollbackAfterVerify) {
            workflowExitCode = applyRun.status ?? 1;
          } else {
            process.exit(applyRun.status ?? 1);
          }
        }
      } else {
        const resultAfterApply = readWorkerResult(manifest, worker.role);
        if (resultAfterApply.status === "succeeded" && (resultAfterApply.changedFiles?.length ?? 0) > 0) {
          appliedRoles.add(worker.role);
        }
      }

      if (rollbackAfterVerify) {
        const resultAfterApply = readWorkerResult(manifest, worker.role);
        const rolePaths = Array.from(new Set([
          ...(resultAfterApply.changedFiles ?? []),
          ...((resultAfterApply.proposedEdits ?? []).map((edit) => edit.path)),
        ])).filter(Boolean);
        rollbackPathspecs.push(...rolePaths);
        const snapshot = captureGitSnapshot(manifest, `${worker.role}-after-apply`, rolePaths);
        rollbackSummary.snapshots.push({
          label: `${worker.role}-after-apply`,
          diffPath: runRelativePath(manifest, snapshot.diffPath),
          statusPath: runRelativePath(manifest, snapshot.statusPath),
          diffTruncated: snapshot.diffWrite.truncated,
          statusTruncated: snapshot.statusWrite.truncated,
        });
      }

      console.log("");
    }
  }

  console.log("## Running verification");
  const verificationWorkers = skipWorkers
    ? targetWorkers
    : targetWorkers.filter((worker) => appliedRoles.has(worker.role));

  if (!applyEdits && !skipWorkers) {
    console.log("Skipping verification: no files were applied. Re-run with --apply to modify files and verify them.");
    console.log("");
  }

  if (applyEdits && !skipWorkers && verificationWorkers.length === 0) {
    console.log("Skipping verification: no worker edits were applied.");
    console.log("");
  }

  for (const worker of applyEdits || skipWorkers ? verificationWorkers : []) {
    const result = readWorkerResult(manifest, worker.role);
    if (result.status !== "succeeded") {
      console.log(`Skipping verification for ${worker.role}: worker status is ${result.status}.`);
      continue;
    }

    const verificationScripts = getWorkflowVerificationScripts(worker.role);
    if (verificationScripts.length === 0) {
      console.log(`Skipping verification for ${worker.role}: no PowerShell verification scripts were listed.`);
      continue;
    }

    console.log(`### Verify ${worker.role}`);
    for (const verificationScript of verificationScripts) {
      console.log(`Running ${verificationScript}`);
      const logPath = rollbackAfterVerify
        ? path.join(getWorkflowDirs(manifest).verificationDir, `${worker.role}.log`)
        : undefined;
      const verify = await runVerificationScript(manifest, worker.role, verificationScript, logPath);
      if (logPath) {
        const logWrite = writeTextLimited(logPath, formatChildLog(verify), verificationLogMaxBytes);
        rollbackSummary.verificationLogs.push({
          role: worker.role,
          script: verificationScript,
          logPath: runRelativePath(manifest, logPath),
          status: verify.status,
          truncated: logWrite.truncated,
        });
      }
      if (verify.status !== 0) {
        workflowExitCode = workflowExitCode || verify.status || 1;
        if (!continueOnError) {
          if (!rollbackAfterVerify) {
            process.exit(verify.status ?? 1);
          }
        }
      }
    }
  }

  if (verifyAll && !applyEdits && !skipWorkers) {
    console.log("## Running full project verification");
    console.log("Skipping verify-all: no files were applied in this dry-run. Re-run with --apply or --skip-workers to verify existing applied results.");
    console.log("");
  }

  if (verifyAll && (applyEdits || skipWorkers)) {
    console.log("## Running full project verification");
    const verificationScript = ".skills/verify-all.ps1";
    console.log(`Running ${verificationScript}`);
    const verify = await runCommandStreaming(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", verificationScript],
      manifest.repoRoot,
      verificationTimeoutMs,
    );
    printStreamingCompletion(verify, "verify all");
    if (rollbackAfterVerify) {
      const logPath = path.join(getWorkflowDirs(manifest).verificationDir, "verify-all.log");
      const logWrite = writeTextLimited(logPath, formatChildLog(verify), verificationLogMaxBytes);
      rollbackSummary.verificationLogs.push({
        role: "all",
        script: verificationScript,
        logPath: runRelativePath(manifest, logPath),
        status: verify.status,
        truncated: logWrite.truncated,
      });
    }

    const succeededWorkers = targetWorkers
      .map((worker) => worker.role)
      .filter((role) => readWorkerResult(manifest, role).status === "succeeded");

    if (verify.status !== 0) {
      workflowExitCode = workflowExitCode || verify.status || 1;
      const failureMessage =
        verify.stderr?.trim() ||
        verify.stdout?.trim() ||
        `verification exited with code ${verify.status ?? "unknown"}`;
      for (const role of succeededWorkers) {
        updateWorkerResultWithVerificationFailure(manifest, role, verificationScript, failureMessage);
      }
      if (!continueOnError) {
        if (rollbackAfterVerify) {
          workflowExitCode = verify.status ?? 1;
        } else {
          process.exit(verify.status ?? 1);
        }
      }
    } else {
      for (const role of succeededWorkers) {
        updateWorkerResultWithVerificationSuccess(manifest, role, verificationScript);
      }
    }
  }

  if (applyEdits && appliedRoles.size > 0) {
    console.log("## Running post-apply quality gate");
    const qualityArgs = [
      runId,
      "--roles",
      [...appliedRoles].join(","),
    ];
    const quality = runNodeScript(path.join("src", "runnerQualityGate.ts"), qualityArgs, orchestratorRoot);
    printWorkflowChild(quality, "quality gate", compact);
    const qualityReportPath = path.join(manifest.runDir, "meta", "quality-gate.json");
    qualityGate = {
      status: quality.status === 0 ? "passed" : "failed",
      reportPath: qualityReportPath,
    };
    if (quality.status !== 0) {
      workflowExitCode = workflowExitCode || quality.status || 1;
      const failureMessage =
        quality.stderr?.trim() ||
        quality.stdout?.trim() ||
        `quality gate exited with code ${quality.status ?? "unknown"}`;
      for (const role of appliedRoles) {
        updateWorkerResultWithQualityGateFailure(manifest, role, failureMessage);
      }
    }
    console.log("");
  }

  } catch (error) {
    workflowExitCode = workflowExitCode || 1;
    console.error(error instanceof Error ? error.message : error);
  } finally {
    performRollback();
  }

  console.log("## Collecting results");
  const collectArgs = compact ? [runId, "--compact"] : [runId];
  const collect = runNodeScript(path.join("src", "collectResults.ts"), collectArgs, orchestratorRoot);
  printWorkflowChild(collect, "collect", compact);
  if (collect.status !== 0 && !continueOnError) {
    process.exit(collect.status ?? 1);
  }

  if (!skipFinalize) {
    console.log("");
    console.log("## Finalizing run");
    const finalizeArgs = compact ? [runId, "--compact"] : [runId];
    const finalize = runNodeScript(path.join("src", "runnerFinalize.ts"), finalizeArgs, orchestratorRoot);
    printWorkflowChild(finalize, "finalize", compact);
    if (finalize.status !== 0 && !continueOnError) {
      process.exit(finalize.status ?? 1);
    }
  }

  if (cleanupRuns) {
    console.log("");
    console.log("## Cleaning old run artifacts");
    const cleanup = runNodeScript(
      path.join("src", "runnerCleanup.ts"),
      [...(cleanupDryRun ? ["--dry-run"] : []), "--protect-run", runId],
      orchestratorRoot,
    );
    printWorkflowChild(cleanup, "cleanup", compact);
    cleanupStatus = cleanup.status;
    if (cleanup.status !== 0) {
      workflowExitCode = workflowExitCode || cleanup.status || 1;
    }
  }

  console.log("");
  console.log("## Updating run report index");
  const reports = runNodeScript(path.join("src", "runnerReports.ts"), compact ? ["--compact"] : [], orchestratorRoot);
  printWorkflowChild(reports, "reports", compact);
  if (reports.status !== 0) {
    workflowExitCode = workflowExitCode || reports.status || 1;
  }

  printFinalTerminalSummary(
    manifest,
    targetWorkers.map((worker) => worker.role),
    workflowExitCode,
    appliedRoles,
    rollbackSummary,
    cleanupStatus,
    qualityGate,
  );

  if (workflowExitCode !== 0) {
    process.exit(workflowExitCode);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
