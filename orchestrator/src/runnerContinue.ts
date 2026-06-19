import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResults } from "./packetStore.js";
import {
  getBlockedReasons,
  getBlockedRoles,
  getFailedRoles,
  countDisplayStatuses,
} from "./resultClassification.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import type { WorkerResultPacket } from "./resultSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Choice = "A" | "B" | "C";

type ContinueCommand = {
  script: "runnerStatus.ts" | "runnerWorkflow.ts";
  args: string[];
  display: string;
};

type ContinueOption = {
  choice: Choice;
  title: string;
  description?: string;
  command?: ContinueCommand;
};

type ContinueDecision = {
  status: string;
  intro: string[];
  options: ContinueOption[];
};

type RunnerManifest = ReturnType<typeof readRunnerManifest>;

function parseArgs(argv: string[]) {
  let choose: Choice | undefined;
  let compact = false;
  let execute = false;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--choose" || arg === "--option") {
      const value = argv[index + 1]?.toUpperCase();
      if (value !== "A" && value !== "B" && value !== "C") {
        throw new Error("--choose must be one of A, B, or C");
      }
      choose = value;
      index += 1;
      continue;
    }
    if (arg === "--execute") {
      execute = true;
      continue;
    }
    if (arg === "--compact" || arg === "--summary-only") {
      compact = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  const runId = positional.join(" ").trim();
  if (!runId) {
    throw new Error("Usage: npm run runner:continue -- <run-id> [--choose A|B|C] [--execute] [--compact]");
  }
  return { runId, choose, compact, execute };
}

function formatStatusCounts(statusCounts: Record<string, number>) {
  const preferredOrder = ["succeeded", "skipped", "blocked", "failed", "pending", "running"];
  return preferredOrder
    .filter((status) => statusCounts[status])
    .map((status) => `${status}=${statusCounts[status]}`)
    .join(", ") || "none";
}

function formatRoles(roles: WorkerTaskPacket["role"][]) {
  return roles.join(",");
}

function getEditableSucceededRoles(results: WorkerResultPacket[]) {
  return results
    .filter((result) => result.status === "succeeded" && (result.proposedEdits?.length ?? 0) > 0)
    .map((result) => result.role);
}

function getReviewOnlyRoles(results: WorkerResultPacket[]) {
  return results
    .filter((result) => result.status === "skipped" || (result.status === "succeeded" && (result.proposedEdits?.length ?? 0) === 0))
    .map((result) => result.role);
}

function hasContractChanges(results: WorkerResultPacket[], roles: WorkerTaskPacket["role"][]) {
  const roleSet = new Set(roles);
  return results.some((result) => roleSet.has(result.role) && result.contractsChanged.length > 0);
}

function hasOpenQuestions(results: WorkerResultPacket[], roles: WorkerTaskPacket["role"][]) {
  const roleSet = new Set(roles);
  return results.some((result) => roleSet.has(result.role) && result.questions.length > 0);
}

function buildApprovalFlags(results: WorkerResultPacket[], roles: WorkerTaskPacket["role"][]) {
  const flags: string[] = [];
  if (hasOpenQuestions(results, roles)) {
    flags.push("--approve-open-questions");
  }
  if (hasContractChanges(results, roles)) {
    flags.push("--approve-contract-changes");
  }
  return flags;
}

function statusCommand(runId: string): ContinueCommand {
  return {
    script: "runnerStatus.ts",
    args: [runId],
    display: `npm run runner:status -- ${runId}`,
  };
}

function reuseApplyCommand(runId: string, roles: WorkerTaskPacket["role"][], extraFlags: string[] = []): ContinueCommand {
  const rolesArg = formatRoles(roles);
  return {
    script: "runnerWorkflow.ts",
    args: [
      runId,
      "--compact",
      "--roles",
      rolesArg,
      "--reuse-worker-results",
      "--apply-provider",
      "openai",
      "--apply",
      "--rollback-after-verify",
      "--concurrency",
      "1",
      "--continue-on-error",
      ...extraFlags,
    ],
    display: `npm run runner:reuse-apply -- ${runId} --roles ${rolesArg}${extraFlags.length > 0 ? ` ${extraFlags.join(" ")}` : ""}`,
  };
}

function keepAppliedCommand(runId: string, roles: WorkerTaskPacket["role"][]): ContinueCommand {
  const rolesArg = formatRoles(roles);
  return {
    script: "runnerWorkflow.ts",
    args: [
      runId,
      "--compact",
      "--roles",
      rolesArg,
      "--reuse-worker-results",
      "--apply-provider",
      "openai",
      "--apply",
      "--keep-applied",
      "--concurrency",
      "1",
      "--continue-on-error",
    ],
    display: `npm run runner:workflow -- ${runId} --compact --roles ${rolesArg} --reuse-worker-results --apply-provider openai --apply --keep-applied --concurrency 1 --continue-on-error`,
  };
}

function hasSuccessfulRollbackRehearsal(manifest: RunnerManifest) {
  const rollbackSummaryPath = path.join(manifest.runDir, "meta", "rollback-summary.json");
  if (!fs.existsSync(rollbackSummaryPath)) {
    return false;
  }

  try {
    const rollbackSummary = JSON.parse(fs.readFileSync(rollbackSummaryPath, "utf8")) as {
      rollback?: {
        restoreStatus?: number | null;
        cleanStatus?: number | null;
        finalWorktreeClean?: boolean;
      };
    };
    return rollbackSummary.rollback?.restoreStatus === 0
      && rollbackSummary.rollback?.cleanStatus === 0
      && rollbackSummary.rollback?.finalWorktreeClean === true;
  } catch {
    return false;
  }
}

function hasPassedQualityGate(manifest: RunnerManifest) {
  const qualityGatePath = path.join(manifest.runDir, "meta", "quality-gate.json");
  if (!fs.existsSync(qualityGatePath)) {
    return false;
  }

  try {
    const qualityGate = JSON.parse(fs.readFileSync(qualityGatePath, "utf8")) as { status?: string };
    return qualityGate.status === "passed";
  } catch {
    return false;
  }
}

function buildContinueDecision(manifest: RunnerManifest, results: WorkerResultPacket[]): ContinueDecision {
  const runId = manifest.runId;
  const blockedRoles = getBlockedRoles(results);
  const failedRoles = getFailedRoles(results);
  const editableSucceededRoles = getEditableSucceededRoles(results);
  const reviewOnlyRoles = getReviewOnlyRoles(results);
  const safeRehearsalPassed = hasSuccessfulRollbackRehearsal(manifest) && hasPassedQualityGate(manifest);

  if (blockedRoles.length > 0) {
    const approvalFlags = buildApprovalFlags(results, blockedRoles);
    return {
      status: "blocked",
      intro: [
        "This run reached a safety gate. Do not apply until you decide how to handle the question or contract change.",
      ],
      options: [
        {
          choice: "A",
          title: "Inspect details first",
          command: statusCommand(runId),
        },
        {
          choice: "B",
          title: "Approve and rehearse the existing proposed edits",
          description: "Runs with rollback and includes required approval flags.",
          command: reuseApplyCommand(runId, blockedRoles, approvalFlags),
        },
        {
          choice: "C",
          title: "Do not approve; create a safer new plan",
          description: 'Manual next step: npm run runner:plan -- --roles <roles> "<revised request>"',
        },
      ],
    };
  }

  if (failedRoles.length > 0) {
    return {
      status: "failed",
      intro: ["Something failed outside the normal safety-gate flow."],
      options: [
        {
          choice: "A",
          title: "Inspect the failure first",
          command: statusCommand(runId),
        },
        {
          choice: "B",
          title: "Retry apply without another worker call if proposed edits exist",
          command: reuseApplyCommand(runId, failedRoles),
        },
        {
          choice: "C",
          title: "Start a new narrower request",
          description: "Use this when the proposed edits look wrong or the failure needs a different plan.",
        },
      ],
    };
  }

  if (editableSucceededRoles.length > 0) {
    return {
      status: safeRehearsalPassed ? "ready for accept" : "ready for apply rehearsal",
      intro: [
        safeRehearsalPassed
          ? "A safe rehearsal passed with rollback and quality gate. You can keep the same proposed edits intentionally."
          : "Worker proposed edits are available. Run a safe rehearsal first before accepting them.",
      ],
      options: [
        {
          choice: "A",
          title: "Safe rehearsal with rollback",
          command: reuseApplyCommand(runId, editableSucceededRoles),
        },
        safeRehearsalPassed
          ? {
              choice: "B",
              title: "Keep the same proposed edits intentionally",
              description: "This applies files to the worktree using the already rehearsed worker result.",
              command: keepAppliedCommand(runId, editableSucceededRoles),
            }
          : {
              choice: "B",
              title: "Locked until safe rehearsal passes",
              description: "Run Option A first. Direct apply is still available through runner:apply when you intentionally want to bypass the rehearsal chain.",
            },
        {
          choice: "C",
          title: "Start a new request instead of approving this run",
          description: "Use this when the plan is not right.",
        },
      ],
    };
  }

  if (reviewOnlyRoles.length > 0) {
    return {
      status: "review complete",
      intro: ["No editable proposed changes were found."],
      options: [
        {
          choice: "A",
          title: "Inspect the report and treat this run as complete",
          command: statusCommand(runId),
        },
        {
          choice: "B",
          title: "Start a new request if implementation work is still needed",
        },
      ],
    };
  }

  return {
    status: "no actionable worker result",
    intro: ["Run runner:status or inspect the report before continuing."],
    options: [
      {
        choice: "A",
        title: "Inspect details",
        command: statusCommand(runId),
      },
    ],
  };
}

function printOption(runId: string, option: ContinueOption) {
  console.log(`Option ${option.choice} - ${option.title}`);
  if (option.description) {
    console.log(`  ${option.description}`);
  }
  if (option.command) {
    console.log(`  Preview: npm run runner:continue -- ${runId} --choose ${option.choice}`);
    console.log(`  Execute: npm run runner:continue -- ${runId} --choose ${option.choice} --execute`);
    console.log(`  Expands to: ${option.command.display}`);
  } else {
    console.log("  Manual decision required; this option is not executable.");
  }
}

function printDecision(runId: string, decision: ContinueDecision) {
  console.log(`Status: ${decision.status}`);
  for (const line of decision.intro) {
    console.log(line);
  }
  for (const option of decision.options) {
    printOption(runId, option);
  }
}

function printCompactDecision(runId: string, decision: ContinueDecision) {
  console.log(`runner:continue: status=${decision.status}`);
  for (const option of decision.options) {
    const executable = option.command ? "executable" : "manual";
    console.log(`${option.choice}: ${option.title} (${executable})`);
    if (option.command) {
      console.log(`   preview: npm run runner:continue:${option.choice.toLowerCase()} -- ${runId}`);
      console.log(`   execute: npm run runner:continue:${option.choice.toLowerCase()}:execute -- ${runId}`);
      if (option.choice === "B") {
        console.log("   latest live shortcut: npm run runner:accept");
      }
    }
  }
}

function runCommand(orchestratorRoot: string, command: ContinueCommand) {
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(orchestratorRoot, "src", command.script);
  return spawnSync(process.execPath, [tsxCli, scriptPath, ...command.args], {
    cwd: orchestratorRoot,
    stdio: "inherit",
    windowsHide: true,
  });
}

async function main() {
  const { runId, choose, compact, execute } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const results = readWorkerResults(manifest);
  const statusCounts = countDisplayStatuses(results);
  const blockedReasons = getBlockedReasons(results);
  const decision = buildContinueDecision(manifest, results);

  if (compact && !choose) {
    console.log(`# Runner Continue`);
    console.log(`Run ID: ${manifest.runId}`);
    console.log(`Mode: ${manifest.mode}`);
    console.log(`Workers: ${formatStatusCounts(statusCounts)}`);
    if (blockedReasons.length > 0) {
      console.log(`Blocked reasons: ${blockedReasons.length}`);
    }
    printCompactDecision(manifest.runId, decision);
    console.log(`Report: ${manifest.reportPath}`);
    console.log(`HTML report: ${path.join(manifest.runDir, "report.html")}`);
    return;
  }

  console.log("# Runner Continue");
  console.log(`Run ID: ${manifest.runId}`);
  console.log(`Request: ${manifest.request}`);
  console.log(`Mode: ${manifest.mode}`);
  console.log(`Workers: ${formatStatusCounts(statusCounts)}`);
  if (blockedReasons.length > 0) {
    console.log("Blocked reasons:");
    for (const reason of blockedReasons) {
      console.log(`- ${reason}`);
    }
  }
  console.log("");
  console.log("## Recommended Next Step");

  if (!choose) {
    printDecision(manifest.runId, decision);
  } else {
    const selected = decision.options.find((option) => option.choice === choose);
    if (!selected) {
      throw new Error(`Option ${choose} is not available for this run status.`);
    }
    console.log(`Selected: Option ${selected.choice} - ${selected.title}`);
    if (selected.description) {
      console.log(selected.description);
    }
    if (!selected.command) {
      console.log("Manual decision required; this option is not executable.");
      if (execute) {
        throw new Error(`Option ${selected.choice} is a manual decision and cannot be executed.`);
      }
      console.log("Preview only. Start a new request manually if this is the right choice.");
      console.log("");
      console.log(`Report: ${manifest.reportPath}`);
      console.log(`HTML report: ${path.join(manifest.runDir, "report.html")}`);
      return;
    }
    console.log(`Expands to: ${selected.command.display}`);
    if (!execute) {
      console.log("Preview only. Add --execute to run this option.");
    } else {
      console.log("");
      console.log(`## Executing Option ${selected.choice}`);
      const result = runCommand(orchestratorRoot, selected.command);
      process.exit(result.status ?? 1);
    }
  }

  console.log("");
  console.log(`Report: ${manifest.reportPath}`);
  console.log(`HTML report: ${path.join(manifest.runDir, "report.html")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
