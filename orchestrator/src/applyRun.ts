import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readRunnerManifest, readWorkerResult, writeWorkerResult } from "./packetStore.js";
import { applyPacketSchema, type ApplyPacket } from "./applySchemas.js";
import { assertPacketMatchesApprovedReview, loadApprovedApplyReview } from "./applyApproval.js";
import { withOpenAIRetry } from "./openaiRetry.js";
import { appendApiUsageRecord, extractOpenAIUsage, type ApiUsage } from "./apiUsage.js";
import { assertSamePathSet, matchesRepoPathRule, normalizeRepoRelativePath, resolveRepoPath } from "./pathSafety.js";
import { openAIReasoningRequestPart, parseOpenAIReasoningEffort } from "./openaiOptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SupportedProvider = "openai" | "manual" | "test";

const applyExecutionSchema = z.object({
  status: z.enum(["succeeded", "failed", "skipped"]),
  summary: z.string(),
  changedFiles: z.array(z.string()),
  verificationRun: z.array(z.string()),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
  fileEdits: z.array(
    z.object({
      path: z.string(),
      action: z.enum(["create", "update", "delete"]),
      summary: z.string(),
      content: z.string().optional(),
    }),
  ),
});

type ApplyExecution = z.infer<typeof applyExecutionSchema>;

function parseArgs(argv: string[]) {
  const filtered = [...argv];
  const providerIndex = filtered.findIndex((item) => item === "--provider");
  const approveOpenQuestionsIndex = filtered.findIndex((item) => item === "--approve-open-questions");
  let provider: SupportedProvider = (process.env.APPLY_PROVIDER as SupportedProvider) || "openai";
  let approveOpenQuestions = false;

  if (providerIndex >= 0) {
    provider = filtered[providerIndex + 1] as SupportedProvider;
    filtered.splice(providerIndex, 2);
  }
  if (approveOpenQuestionsIndex >= 0) {
    approveOpenQuestions = true;
    filtered.splice(approveOpenQuestionsIndex, 1);
  }

  const [runId, role] = filtered;
  if (!runId || !role || !["frontend", "rust", "java", "mobile"].includes(role)) {
    throw new Error("Usage: npm run apply:run -- <run-id> <frontend|rust|java|mobile> [--provider openai|manual]");
  }

  if (!["openai", "manual", "test"].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return {
    runId,
    role,
    provider,
    approveOpenQuestions,
  };
}

function isAllowedPath(repoRelativePath: string, packet: ApplyPacket) {
  const allowed = packet.allowedPaths.some((pattern) => matchesRepoPathRule(repoRelativePath, pattern));
  const blocked = packet.blockedPaths.some((pattern) => matchesRepoPathRule(repoRelativePath, pattern));
  return allowed && !blocked;
}

function loadApplyPacket(orchestratorRoot: string, runId: string, role: string) {
  const packetPath = path.join(orchestratorRoot, "runs", runId, "applies", `${role}.apply.json`);
  return {
    packetPath,
    packet: applyPacketSchema.parse(JSON.parse(fs.readFileSync(packetPath, "utf8"))),
  };
}

function loadCurrentContexts(repoRoot: string, packet: ApplyPacket) {
  return packet.proposedEdits.map((edit) => {
    const { resolvedPath: fullPath } = resolveRepoPath(repoRoot, edit.path);
    const exists = fs.existsSync(fullPath);
    const currentContent = exists ? fs.readFileSync(fullPath, "utf8") : "";
    return {
      ...edit,
      exists,
      currentContent,
    };
  });
}

function renderApplyPrompt(packet: ApplyPacket, contexts: ReturnType<typeof loadCurrentContexts>, approveOpenQuestions: boolean) {
  const lines = [
    "You are Codex applying previously approved worker-proposed edits for the Whiteboard Capture repository.",
    "Return only JSON matching the provided schema.",
    "Generate the exact final file content for each changed file.",
    "Do not propose edits outside the listed files.",
    "Preserve existing style and comments where appropriate.",
    "Add concise human-readable comments only where complex logic benefits from them.",
    "",
    `Role: ${packet.role}`,
    `Goal: ${packet.goal}`,
    approveOpenQuestions
      ? "Open questions from the worker/review stage were explicitly approved by the master. Do not repeat approved non-blocking questions; put follow-up notes in risks instead."
      : "Do not proceed past unresolved blocking questions. If a question blocks safe file content generation, return status failed and put it in questions.",
    "",
    "Contracts:",
    ...packet.contracts.map((item) => `- ${item}`),
    "",
    "Mandatory policy checks:",
    ...packet.policyChecks.map((item) => `- ${item}`),
    "",
    "Required verification:",
    ...packet.requiredVerification.map((item) => `- ${item}`),
    "",
    "Target file edits:",
  ];

  for (const context of contexts) {
    lines.push("");
    lines.push(`## ${context.path}`);
    lines.push(`- action: ${context.action}`);
    lines.push(`- summary: ${context.summary}`);
    lines.push(`- instructions:`);
    for (const instruction of context.instructions) {
      lines.push(`  - ${instruction}`);
    }
    lines.push(`- exists: ${context.exists ? "yes" : "no"}`);
    lines.push("");
    lines.push("Current file content:");
    lines.push("```");
    lines.push(context.currentContent || "<file does not exist>");
    lines.push("```");
  }

  lines.push("");
  lines.push("Output rules:");
  lines.push("- fileEdits must include only the listed paths.");
  lines.push("- For update/create actions, content must contain the full final file content.");
  lines.push("- For delete actions, content must be an empty string.");
  lines.push("- changedFiles should match the files you actually changed.");
  lines.push("- Treat every mandatory policy check as a hard requirement when generating final file content.");
  lines.push("- status should be succeeded only if the file contents are ready to write.");
  lines.push("- If status is succeeded, questions must be empty. Move non-blocking follow-up notes into risks.");
  lines.push("- For Gradle Kotlin DSL (*.gradle.kts), generate valid Kotlin syntax. buildConfigField String values must be Kotlin strings containing a quoted Java string, e.g. buildConfigField(\"String\", \"API_BASE_URL\", \"\\\"http://10.0.2.2:18080\\\"\"). Never use single-quoted multi-character literals such as '\"http://...\"'.");

  return `${lines.join("\n")}\n`;
}

async function runOpenAIApply(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const model = process.env.OPENAI_APPLY_MODEL || process.env.OPENAI_WORKER_MODEL || "gpt-4.1";
  const reasoningEffort = parseOpenAIReasoningEffort(
    process.env.OPENAI_APPLY_REASONING || process.env.OPENAI_WORKER_REASONING,
    "OPENAI_APPLY_REASONING",
  );

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["succeeded", "failed", "skipped"] },
      summary: { type: "string" },
      changedFiles: { type: "array", items: { type: "string" } },
      verificationRun: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      questions: { type: "array", items: { type: "string" } },
      fileEdits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
            action: { type: "string", enum: ["create", "update", "delete"] },
            summary: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "action", "summary", "content"],
        },
      },
    },
    required: ["status", "summary", "changedFiles", "verificationRun", "risks", "questions", "fileEdits"],
  };

  return withOpenAIRetry("OpenAI apply", async () => {
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
              "You are a coding apply executor for the Whiteboard Capture repository. Produce exact final file contents and return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "apply_execution",
            strict: true,
            schema,
          },
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const message = payload?.error?.message || `OpenAI apply request failed with status ${response.status}`;
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
      throw new Error("OpenAI apply response did not contain output_text.");
    }

    return {
      model,
      execution: applyExecutionSchema.parse(JSON.parse(outputText)),
      usage: extractOpenAIUsage(payload),
    };
  });
}

function writeExecutionArtifacts(manifestRunDir: string, role: string, prompt: string, execution: ApplyExecution) {
  const appliesDir = path.join(manifestRunDir, "applies");
  fs.mkdirSync(appliesDir, { recursive: true });
  fs.writeFileSync(path.join(appliesDir, `${role}.apply-execution.md`), prompt, "utf8");
  fs.writeFileSync(path.join(appliesDir, `${role}.apply-result.json`), `${JSON.stringify(execution, null, 2)}\n`, "utf8");
}

function applyFileEdits(repoRoot: string, packet: ApplyPacket, execution: ApplyExecution) {
  for (const fileEdit of execution.fileEdits) {
    if (!isAllowedPath(fileEdit.path, packet)) {
      throw new Error(`Apply edit path is outside allowed scope: ${fileEdit.path}`);
    }

    const { resolvedPath: fullPath } = resolveRepoPath(repoRoot, fileEdit.path);

    if (fileEdit.action === "delete") {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      continue;
    }

    if (typeof fileEdit.content !== "string") {
      throw new Error(`Missing content for ${fileEdit.action} action: ${fileEdit.path}`);
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, fileEdit.content, "utf8");
  }
}

function normalizePathList(paths: string[], label: string) {
  return paths.map((candidate) => {
    const normalized = normalizeRepoRelativePath(candidate);
    if (!normalized) {
      throw new Error(`${label} contains an unsafe repository-relative path: ${candidate}`);
    }
    return normalized;
  });
}

function validateApplyExecution(packet: ApplyPacket, execution: ApplyExecution) {
  if (execution.questions.length > 0) {
    throw new Error(`Apply execution returned unresolved question(s): ${execution.questions.join("; ")}`);
  }

  if (execution.status !== "succeeded") {
    if (execution.changedFiles.length > 0 || execution.fileEdits.length > 0) {
      throw new Error(`Apply execution status ${execution.status} cannot include changed files or file edits.`);
    }
    return;
  }

  const proposedActions = new Map<string, ApplyPacket["proposedEdits"][number]["action"]>();
  for (const edit of packet.proposedEdits) {
    const normalized = normalizePathList([edit.path], "Apply packet")[0];
    if (proposedActions.has(normalized)) {
      throw new Error(`Apply packet contains duplicate proposed path: ${normalized}`);
    }
    if (!isAllowedPath(normalized, packet)) {
      throw new Error(`Apply packet path is outside allowed scope: ${normalized}`);
    }
    proposedActions.set(normalized, edit.action);
  }

  const executionPaths = normalizePathList(execution.fileEdits.map((edit) => edit.path), "Apply execution");
  assertSamePathSet("Apply execution fileEdits", [...proposedActions.keys()], executionPaths);

  for (const fileEdit of execution.fileEdits) {
    const normalized = normalizePathList([fileEdit.path], "Apply execution")[0];
    const approvedAction = proposedActions.get(normalized);
    if (approvedAction !== fileEdit.action) {
      throw new Error(`Apply execution action for ${normalized} is ${fileEdit.action}, expected ${approvedAction}.`);
    }
  }

  const changedFiles = normalizePathList(execution.changedFiles, "Apply execution changedFiles");
  assertSamePathSet("Apply execution changedFiles", executionPaths, changedFiles);
}

function normalizeApplyExecutionQuestions(execution: ApplyExecution, approveOpenQuestions: boolean): ApplyExecution {
  if (!approveOpenQuestions || execution.status !== "succeeded" || execution.questions.length === 0) {
    return execution;
  }

  return {
    ...execution,
    risks: [
      ...execution.risks,
      ...execution.questions.map((question) => `Approved open follow-up: ${question}`),
    ],
    questions: [],
  };
}

function runTestApply(packet: ApplyPacket): ApplyExecution {
  const shouldReturnQuestion = packet.goal.includes("apply-question-guard");
  const shouldFailQualityGate = packet.goal.includes("workflow-quality-gate-smoke");
  return {
    status: "succeeded",
    summary: `[TEST] Applied ${packet.role} rollback pipeline test edits.`,
    changedFiles: packet.proposedEdits.map((edit) => edit.path),
    verificationRun: [],
    risks: [
      "This is a local test apply execution used only to exercise apply, verify, and rollback plumbing.",
    ],
    questions: shouldReturnQuestion ? ["[TEST] apply execution question guard"] : [],
    fileEdits: packet.proposedEdits.map((edit) => ({
      path: edit.path,
      action: edit.action,
      summary: edit.summary,
      content:
        edit.action === "delete"
          ? ""
          : shouldFailQualityGate
            ? [
                "# Workflow quality gate smoke",
                "",
                "This temporary file intentionally contains whiteboard@service.example.",
                "The workflow quality smoke should pass role verification, then fail the post-apply quality gate.",
                "",
              ].join("\n")
            : [
                "orchestrator rollback test",
                `role=${packet.role}`,
                `run_id=${packet.runId}`,
                "This file should be removed by --rollback-after-verify.",
                "",
              ].join("\n"),
    })),
  };
}

function syncWorkerResultAfterApply(
  manifest: ReturnType<typeof readRunnerManifest>,
  role: string,
  execution: ApplyExecution,
) {
  const existing = readWorkerResult(manifest, role as "frontend" | "rust" | "java" | "mobile");
  writeWorkerResult(manifest, {
    ...existing,
    status: execution.status,
    summary: execution.summary,
    changedFiles: execution.changedFiles,
    verificationRun:
      execution.verificationRun.length > 0
        ? execution.verificationRun
        : existing.verificationRun,
    risks: execution.risks,
    questions: execution.questions,
  });
}

async function main() {
  const { runId, role, provider, approveOpenQuestions } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const { packet } = loadApplyPacket(orchestratorRoot, runId, role);
  const review = loadApprovedApplyReview(orchestratorRoot, runId, role);
  assertPacketMatchesApprovedReview(packet, review.approvedEdits);
  const contexts = loadCurrentContexts(manifest.repoRoot, packet);
  const prompt = renderApplyPrompt(packet, contexts, approveOpenQuestions);

  if (provider === "manual") {
    const manualPath = path.join(manifest.runDir, "applies", `${role}.apply-execution.md`);
    fs.mkdirSync(path.dirname(manualPath), { recursive: true });
    fs.writeFileSync(manualPath, prompt, "utf8");
    console.log(`# Apply Manual Preparation`);
    console.log(`Run ID: ${runId}`);
    console.log(`Role: ${role}`);
    console.log(`Prompt: ${manualPath}`);
    return;
  }

  let apiUsage: ApiUsage | undefined;
  let apiModel: string | undefined;
  const rawExecution = provider === "test"
    ? runTestApply(packet)
    : await runOpenAIApply(prompt).then((result) => {
        apiUsage = result.usage;
        apiModel = result.model;
        return result.execution;
      });
  const execution = normalizeApplyExecutionQuestions(rawExecution, approveOpenQuestions);
  writeExecutionArtifacts(manifest.runDir, role, prompt, execution);
  validateApplyExecution(packet, execution);
  if (execution.status === "succeeded") {
    applyFileEdits(manifest.repoRoot, packet, execution);
  }
  syncWorkerResultAfterApply(manifest, role, execution);
  if (provider === "openai" && apiUsage && apiModel) {
    appendApiUsageRecord(manifest, {
      stage: "apply",
      role,
      provider: "openai",
      model: apiModel,
      usage: apiUsage,
    });
  }

  console.log(`# Apply Run Complete`);
  console.log(`Run ID: ${runId}`);
  console.log(`Role: ${role}`);
  console.log(`Provider: ${provider}`);
  console.log(`Status: ${execution.status}`);
  console.log(`Changed files: ${execution.changedFiles.join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
