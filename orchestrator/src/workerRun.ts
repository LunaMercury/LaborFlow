import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResult, readWorkerTask, writeWorkerResult } from "./packetStore.js";
import { workerResultPacketSchema, type WorkerResultPacket } from "./resultSchemas.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";
import { withOpenAIRetry } from "./openaiRetry.js";
import { appendApiUsageRecord, extractOpenAIUsage, type ApiUsage } from "./apiUsage.js";
import { openAIReasoningRequestPart, parseOpenAIReasoningEffort } from "./openaiOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SupportedProvider = "claude" | "openai" | "manual" | "test";

type Args = {
  runId: string;
  role: WorkerTaskPacket["role"];
  provider: SupportedProvider;
};

const sourceContextTotalBytes = Number.parseInt(process.env.WORKER_SOURCE_CONTEXT_TOTAL_BYTES || `${32 * 1024}`, 10);
const sourceContextFileBytes = Number.parseInt(process.env.WORKER_SOURCE_CONTEXT_FILE_BYTES || `${12 * 1024}`, 10);
const skippedContextDirectories = new Set([
  ".git",
  ".gradle",
  ".gradle-user-home",
  ".idea",
  "bin",
  "build",
  "captures",
  "dist",
  "gradle",
  "node_modules",
  "runs",
  "target",
]);
const skippedContextFiles = new Set([
  ".env",
  ".env.local",
  "local.properties",
]);
const textContextExtensions = new Set([
  ".css",
  ".gradle",
  ".java",
  ".json",
  ".kt",
  ".kts",
  ".md",
  ".properties",
  ".rs",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
]);

function parseArgs(argv: string[]): Args {
  const providerFlagIndex = argv.findIndex((item) => item === "--provider");
  let provider: SupportedProvider = (process.env.WORKER_PROVIDER as SupportedProvider) || "openai";
  const filtered = [...argv];

  if (providerFlagIndex >= 0) {
    provider = filtered[providerFlagIndex + 1] as SupportedProvider;
    filtered.splice(providerFlagIndex, 2);
  }

  const [runId, role] = filtered;

  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error("Usage: npm run worker:run -- <run-id> <frontend|rust|java|mobile> [--provider openai|claude|manual]");
  }

  if (!["openai", "claude", "manual", "test"].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return {
    runId,
    role: role as WorkerTaskPacket["role"],
    provider,
  };
}

function createResultJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      role: { type: "string", enum: ["frontend", "rust", "java", "mobile"] },
      status: { type: "string", enum: ["running", "succeeded", "failed", "skipped"] },
      changedFiles: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
      contractsChanged: { type: "array", items: { type: "string" } },
      verificationRun: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      questions: { type: "array", items: { type: "string" } },
      proposedEdits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            action: { type: "string", enum: ["create", "update", "delete"] },
            summary: { type: "string" },
            instructions: { type: "array", items: { type: "string" } },
          },
          required: ["path", "action", "summary", "instructions"],
        },
      },
    },
    required: ["role", "status", "changedFiles", "summary", "contractsChanged", "verificationRun", "risks", "questions", "proposedEdits"],
  };
}

function normalizeRepoPath(filePath: string) {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function moduleRoot(task: WorkerTaskPacket) {
  return normalizeRepoPath(task.allowedPaths[0] ?? "").replace(/\/\*\*$/, "");
}

function isSafeContextFile(repoRoot: string, task: WorkerTaskPacket, filePath: string) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(filePath);
  const relativePath = normalizeRepoPath(path.relative(resolvedRepoRoot, resolvedPath));
  const root = moduleRoot(task);

  if (!relativePath || relativePath.startsWith("../") || relativePath === "..") {
    return false;
  }

  if (relativePath !== root && !relativePath.startsWith(`${root}/`)) {
    return false;
  }

  if (relativePath.split("/").some((segment) => skippedContextDirectories.has(segment))) {
    return false;
  }

  if (skippedContextFiles.has(path.basename(relativePath))) {
    return false;
  }

  return textContextExtensions.has(path.extname(relativePath).toLowerCase());
}

function collectContextFiles(repoRoot: string, task: WorkerTaskPacket) {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const touchedFiles = new Set<string>();

  const addFile = (filePath: string, touched = false) => {
    if (!isSafeContextFile(repoRoot, task, filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return;
    }

    const resolved = path.resolve(filePath);
    if (touched) {
      touchedFiles.add(resolved);
    }
    if (!seen.has(resolved)) {
      seen.add(resolved);
      candidates.push(resolved);
    }
  };

  const walk = (dirPath: string, touched = false) => {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return;
    }

    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isDirectory() && skippedContextDirectories.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, touched);
      } else {
        addFile(fullPath, touched);
      }
    }
  };

  for (const touchedArea of task.touchedAreas) {
    const fullPath = path.resolve(repoRoot, touchedArea);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, true);
    } else {
      addFile(fullPath, true);
    }
  }

  walk(path.resolve(repoRoot, moduleRoot(task), "src"));
  walk(path.resolve(repoRoot, moduleRoot(task)));
  const touchedText = Array.from(touchedFiles)
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  return candidates.sort((left, right) => {
    const leftTouched = touchedFiles.has(left);
    const rightTouched = touchedFiles.has(right);
    if (leftTouched !== rightTouched) {
      return leftTouched ? -1 : 1;
    }

    const leftReferenced = touchedText.includes(path.basename(left, path.extname(left)));
    const rightReferenced = touchedText.includes(path.basename(right, path.extname(right)));
    if (leftReferenced !== rightReferenced) {
      return leftReferenced ? -1 : 1;
    }

    return normalizeRepoPath(path.relative(repoRoot, left))
      .localeCompare(normalizeRepoPath(path.relative(repoRoot, right)));
  });
}

function renderSourceContext(repoRoot: string, task: WorkerTaskPacket) {
  const sections: string[] = [];
  let remainingBytes = sourceContextTotalBytes;

  for (const filePath of collectContextFiles(repoRoot, task)) {
    if (remainingBytes <= 0) {
      break;
    }

    const relativePath = normalizeRepoPath(path.relative(repoRoot, filePath));
    const content = fs.readFileSync(filePath, "utf8");
    const contentBytes = Buffer.from(content, "utf8");
    const previewBytes = Math.min(sourceContextFileBytes, remainingBytes);
    const preview = contentBytes.length <= previewBytes
      ? content
      : [
          contentBytes.subarray(0, Math.floor(previewBytes * 0.7)).toString("utf8"),
          "\n... [middle truncated by orchestrator] ...\n",
          contentBytes.subarray(contentBytes.length - Math.ceil(previewBytes * 0.3)).toString("utf8"),
        ].join("");
    const truncated = contentBytes.length > previewBytes;
    sections.push(
      [
        `### ${relativePath}${truncated ? " (truncated)" : ""}`,
        "```",
        preview,
        "```",
      ].join("\n"),
    );
    remainingBytes -= Buffer.byteLength(preview, "utf8");
  }

  return sections.length > 0
    ? sections.join("\n\n")
    : "(No safe source previews were selected for this role.)";
}

function renderExecutionPrompt(runId: string, task: WorkerTaskPacket, resultPath: string, repoRoot: string): string {
  return [
    `You are the ${task.role} worker for the Whiteboard Capture repository.`,
    `Work only inside the allowed paths.`,
    `Do not modify blocked paths.`,
    `If you need a contract change outside your scope, do not edit it. Report it in contractsChanged or questions.`,
    `Run ID: ${runId}`,
    ``,
    `Goal:`,
    task.goal,
    ``,
    `Allowed paths:`,
    ...task.allowedPaths.map((item) => `- ${item}`),
    ``,
    `Blocked paths:`,
    ...task.blockedPaths.map((item) => `- ${item}`),
    ``,
    `Touched areas:`,
    ...task.touchedAreas.map((item) => `- ${item}`),
    ``,
    `Implementation steps:`,
    ...task.implementationSteps.map((item) => `- ${item}`),
    ``,
    `Dependencies:`,
    ...task.dependencies.map((item) => `- ${item}`),
    ``,
    `Contracts:`,
    ...task.contracts.map((item) => `- ${item}`),
    ``,
    `Mandatory policy checks:`,
    ...task.policyChecks.map((item) => `- ${item}`),
    ``,
    `Required verification:`,
    ...task.requiredVerification.map((item) => `- ${item}`),
    ``,
    `Repository source context:`,
    `The following bounded source previews are authoritative for this planning pass.`,
    renderSourceContext(repoRoot, task),
    ``,
    `Instructions:`,
    `- Do not modify repository files in the worker phase.`,
    `- Produce proposedEdits only; the apply phase is responsible for actual file changes.`,
    `- Do not claim that verification commands were run unless you actually executed them in this worker runtime and observed the result.`,
    `- If you cannot execute local verification commands, leave verificationRun as an empty array and list the required verification in risks/questions when relevant.`,
    `- Return only JSON matching the provided schema.`,
    `- Use changedFiles as repository-relative paths.`,
    `- proposedEdits must list the concrete file-by-file changes that should be applied in this repository.`,
    `- Each proposedEdits item must include path, action, summary, and step-by-step instructions.`,
    `- Do not propose a change that is already implemented in the repository source context.`,
    `- Treat the supplied contracts and source context as authoritative. Do not repeat a question when they already answer it.`,
    `- Use questions only for unresolved decisions that block a safe apply. Put non-blocking cautions in risks instead.`,
    `- If no file change is needed, return proposedEdits as an empty array.`,
    `- Treat every mandatory policy check as a hard requirement, not a suggestion.`,
    `- If any policy check cannot be satisfied in your scope, set status to 'failed' or report the blocker clearly in risks/questions.`,
    `- Use status 'succeeded' only if your scoped work and verification are complete.`,
    `- Use status 'failed' if you were blocked or verification failed.`,
    `- Use status 'skipped' only if no code change was necessary.`,
    `- The runner will write your JSON to: ${resultPath}`,
  ].join("\n");
}

function writeFailureResult(
  role: WorkerTaskPacket["role"],
  resultPath: string,
  summary: string,
  risks: string[],
  questions: string[] = [],
) {
  const result: WorkerResultPacket = {
    role,
    status: "failed",
    changedFiles: [],
    summary,
    contractsChanged: [],
    verificationRun: [],
    risks,
    questions,
    proposedEdits: [],
  };

  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function testEditPathForRole(role: WorkerTaskPacket["role"]) {
  const paths: Record<WorkerTaskPacket["role"], string> = {
    frontend: "web/.orchestrator-rollback-test.txt",
    rust: "backend-fast/.orchestrator-rollback-test.txt",
    java: "backend-core/src/main/resources/orchestrator-rollback-test.txt",
    mobile: "mobile/.orchestrator-rollback-test.txt",
  };
  return paths[role];
}

function isWorkflowQualityGateSmoke(task: WorkerTaskPacket) {
  return task.goal.includes("workflow-quality-gate-smoke");
}

function createTestWorkerResult(task: WorkerTaskPacket): WorkerResultPacket {
  const editPath = isWorkflowQualityGateSmoke(task)
    ? "web/src/components/WorkflowQualityGateSmoke.md"
    : testEditPathForRole(task.role);
  return {
    role: task.role,
    status: "succeeded",
    changedFiles: [],
    summary: isWorkflowQualityGateSmoke(task)
      ? `[TEST] ${task.role} workflow quality gate smoke proposed one intentionally unsafe temporary edit.`
      : `[TEST] ${task.role} rollback pipeline test proposed one safe temporary edit.`,
    contractsChanged: [],
    verificationRun: [],
    risks: [
      "This is a local test worker result used only to exercise apply, verify, and rollback plumbing.",
    ],
    questions: [],
    proposedEdits: [
      {
        path: editPath,
        action: "create",
        summary: isWorkflowQualityGateSmoke(task)
          ? "Create a temporary source file containing patterns that the quality gate must reject."
          : "Create a tiny temporary file so rollback-after-verify can prove it removes applied edits.",
        instructions: isWorkflowQualityGateSmoke(task)
          ? [
              "Create this file with the deterministic quality-gate smoke content.",
              "Do not modify any other files.",
            ]
          : [
              "Create this file with a short deterministic test message.",
              "Do not modify any other files.",
            ],
      },
    ],
  };
}

function normalizeWorkerResult(
  task: WorkerTaskPacket,
  result: WorkerResultPacket,
  provider: SupportedProvider,
): WorkerResultPacket {
  if (provider === "manual") {
    return result;
  }

  if (result.status !== "running") {
    return result;
  }

  const proposedEditCount = result.proposedEdits?.length ?? 0;
  const changedFileCount = result.changedFiles?.length ?? 0;
  const hasReadyWork = proposedEditCount > 0 || changedFileCount > 0;
  if (!hasReadyWork) {
    return result;
  }

  const existingSummary = result.summary.trim();
  const normalizedSummary = existingSummary.includes("[normalized:")
    ? existingSummary
    : `${existingSummary} [normalized: proposed edits are ready, so workflow can continue to apply/verify.]`;

  const risks = Array.from(
    new Set([
      ...result.risks,
      `${task.role} worker originally returned status 'running'; orchestrator normalized it to 'succeeded' because concrete edits were produced.`,
    ]),
  );

  return {
    ...result,
    status: "succeeded",
    summary: normalizedSummary,
    risks,
  };
}

function previewText(value: string, maxLength = 240) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function createOpenAITransientError(message: string, status = 503) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function parseOpenAIJson(text: string, status: number) {
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch (error) {
    throw createOpenAITransientError(
      `OpenAI API returned non-JSON response with status ${status}: ${previewText(text) || String(error)}`,
      status >= 500 ? status : 503,
    );
  }
}

function parseOpenAIWorkerOutput(outputText: string) {
  try {
    return JSON.parse(outputText) as unknown;
  } catch (error) {
    throw createOpenAITransientError(
      `OpenAI worker returned non-JSON output: ${previewText(outputText) || String(error)}`,
      503,
    );
  }
}

async function runOpenAIWorker(prompt: string, schema: ReturnType<typeof createResultJsonSchema>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.OPENAI_WORKER_MODEL || "gpt-4.1";
  const reasoningEffort = parseOpenAIReasoningEffort(process.env.OPENAI_WORKER_REASONING, "OPENAI_WORKER_REASONING");
  return withOpenAIRetry("OpenAI worker", async () => {
    const response = await fetch(process.env.OPENAI_WORKER_API_URL || "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        ...openAIReasoningRequestPart(model, reasoningEffort),
        input: [
          {
            role: "system",
            content:
              "You are a coding worker for the Whiteboard Capture repository. Follow the task exactly. Return only valid JSON that matches the provided schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "worker_result",
            strict: true,
            schema,
          },
        },
      }),
    });

    const responseText = await response.text();
    const payload = parseOpenAIJson(responseText, response.status) as {
      error?: { message?: string };
      message?: string;
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const message =
        payload?.error?.message ||
        payload?.message ||
        `OpenAI API request failed with status ${response.status}`;
      const error = new Error(retryAfter ? `${message} retry-after=${retryAfter}s` : message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const outputTextFromItems = Array.isArray(payload?.output)
      ? payload.output
          .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item?.content ?? [])
          .filter((item: { type?: string; text?: string }) => item?.type === "output_text" && typeof item.text === "string")
          .map((item: { text?: string }) => item.text ?? "")
          .join("\n")
          .trim()
      : "";

    const outputText =
      typeof payload?.output_text === "string" && payload.output_text.trim()
        ? payload.output_text
        : outputTextFromItems || undefined;

    if (!outputText) {
      throw new Error("OpenAI response did not contain output_text.");
    }

    return {
      model,
      result: parseOpenAIWorkerOutput(outputText),
      usage: extractOpenAIUsage(payload),
    };
  });
}

async function main() {
  const { runId, role, provider } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const task = readWorkerTask(manifest, role);
  const existingResult = readWorkerResult(manifest, role);
  const workerEntry = manifest.workers.find((item) => item.role === role);

  if (!workerEntry) {
    throw new Error(`Worker entry not found for role: ${role}`);
  }

  const resultPath = workerEntry.resultFile;
  const workersDir = path.join(manifest.runDir, "workers");
  fs.mkdirSync(workersDir, { recursive: true });
  const promptPath = path.join(workersDir, `${role}.prompt.md`);
  fs.writeFileSync(promptPath, `${renderExecutionPrompt(runId, task, resultPath, manifest.repoRoot)}\n`, "utf8");

  if (provider === "manual") {
    const manualResult: WorkerResultPacket = {
      ...existingResult,
      status: "running",
      summary: `${role} worker prompt가 준비되었습니다. 수동 실행 후 result.json을 업데이트해야 합니다.`,
      questions: [
        ...existingResult.questions.filter((item) => !item.includes("실행기")),
        "worker prompt를 읽고 수동으로 실행한 뒤 result.json을 갱신하세요.",
      ],
    };
    writeWorkerResult(manifest, manualResult);
    console.log(`# Worker Manual Preparation`);
    console.log(`Run ID: ${runId}`);
    console.log(`Role: ${role}`);
    console.log(`Prompt: ${promptPath}`);
    console.log(`Result: ${resultPath}`);
    return;
  }

  if (provider === "test") {
    const testResult = createTestWorkerResult(task);
    writeWorkerResult(manifest, testResult);
    console.log(`# Worker Run Complete`);
    console.log(`Run ID: ${runId}`);
    console.log(`Role: ${role}`);
    console.log(`Provider: ${provider}`);
    console.log(`Prompt: ${promptPath}`);
    console.log(`Result: ${resultPath}`);
    console.log(`Status: ${testResult.status}`);
    return;
  }

  const resultJsonSchema = createResultJsonSchema();
  const schema = JSON.stringify(resultJsonSchema);
  const prompt = renderExecutionPrompt(runId, task, resultPath, manifest.repoRoot);
  let rawResult: unknown;
  let apiUsage: ApiUsage | undefined;
  let apiModel: string | undefined;

  if (provider === "openai") {
    try {
      const openAIResult = await runOpenAIWorker(prompt, resultJsonSchema);
      rawResult = openAIResult.result;
      apiUsage = openAIResult.usage;
      apiModel = openAIResult.model;
    } catch (error) {
      writeFailureResult(
        role,
        resultPath,
        `${role} worker OpenAI 실행에 실패했습니다.`,
        [error instanceof Error ? error.message : String(error)],
        ["OPENAI_API_KEY, 모델명, 네트워크 연결 상태를 확인하세요."],
      );
      throw error;
    }
  } else {
    const command = "claude";
    const args = [
      "--print",
      "--output-format",
      "json",
      "--json-schema",
      schema,
      "--permission-mode",
      "acceptEdits",
      "--add-dir",
      manifest.repoRoot,
    ];

    const child = spawnSync(command, args, {
      cwd: manifest.repoRoot,
      encoding: "utf8",
      input: prompt,
      timeout: 20 * 60 * 1000,
    });

    if (child.error) {
      writeFailureResult(
        role,
        resultPath,
        `${role} worker CLI 실행에 실패했습니다.`,
        [String(child.error.message)],
        ["claude CLI 설치 또는 인증 상태를 확인하세요."],
      );
      throw child.error;
    }

    if (child.status !== 0) {
      writeFailureResult(
        role,
        resultPath,
        `${role} worker CLI가 비정상 종료되었습니다.`,
        [child.stderr?.trim() || child.stdout?.trim() || `signal=${child.signal ?? "none"}` || "unknown cli error"],
        ["claude CLI 인증, 권한 모드, 워크스페이스 접근 권한을 확인하세요."],
      );
      throw new Error(child.stderr?.trim() || child.stdout?.trim() || `CLI exited with code ${child.status} signal=${child.signal ?? "none"}`);
    }

    rawResult = JSON.parse(child.stdout);
  }

  const parsed = workerResultPacketSchema.safeParse(rawResult);
  if (!parsed.success) {
    writeFailureResult(
      role,
      resultPath,
      `${role} worker 결과를 파싱하지 못했습니다.`,
      [parsed.error.message],
      ["CLI 출력이 worker result schema를 따르도록 프롬프트를 조정해야 합니다."],
    );
    throw new Error(parsed.error.message);
  }

  const normalized = normalizeWorkerResult(task, {
    ...parsed.data,
    role,
  }, provider);
  writeWorkerResult(manifest, normalized);
  if (provider === "openai" && apiUsage && apiModel) {
    appendApiUsageRecord(manifest, {
      stage: "worker",
      role,
      provider: "openai",
      model: apiModel,
      usage: apiUsage,
    });
  }

  console.log(`# Worker Run Complete`);
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Provider: ${provider}`);
  console.log(`Prompt: ${promptPath}`);
  console.log(`Result: ${resultPath}`);
  console.log(`Status: ${normalized.status}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});



