import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readRunnerManifest, readWorkerResults } from "./packetStore.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Severity = "error" | "warn";

type Finding = {
  severity: Severity;
  file: string;
  rule: string;
  message: string;
};

const sourceExtensions = new Set([
  ".css",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".rs",
  ".ts",
  ".tsx",
]);

const textExtensions = new Set([
  ...sourceExtensions,
  ".json",
  ".properties",
  ".yaml",
  ".yml",
  ".md",
]);

function parseArgs(argv: string[]) {
  let roles: WorkerTaskPacket["role"][] | undefined;
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--roles") {
      roles = argv[index + 1]?.split(",").map((item) => item.trim()).filter(Boolean) as WorkerTaskPacket["role"][];
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  const runId = positional.join(" ").trim();
  if (!runId) {
    throw new Error("Usage: npm run runner:quality -- <run-id> [--roles frontend,java]");
  }

  return { runId, roles };
}

function isTextFile(relativePath: string) {
  return textExtensions.has(path.extname(relativePath).toLowerCase());
}

function isSourceFile(relativePath: string) {
  return sourceExtensions.has(path.extname(relativePath).toLowerCase());
}

function collectTargetFiles(manifest: ReturnType<typeof readRunnerManifest>, roles?: WorkerTaskPacket["role"][]) {
  const roleSet = roles ? new Set(roles) : undefined;
  const files = new Set<string>();

  for (const result of readWorkerResults(manifest)) {
    if (roleSet && !roleSet.has(result.role)) {
      continue;
    }
    for (const filePath of result.changedFiles ?? []) {
      files.add(filePath);
    }
    for (const edit of result.proposedEdits ?? []) {
      if (edit.action !== "delete") {
        files.add(edit.path);
      }
    }
  }

  return [...files].filter(isTextFile).sort();
}

function addFinding(findings: Finding[], severity: Severity, file: string, rule: string, message: string) {
  findings.push({ severity, file, rule, message });
}

function scanFile(relativePath: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const extension = path.extname(relativePath).toLowerCase();

  if (/\b[\w.+-]+@(service\.)?example\b/i.test(content) || /\b(example\.com|service\.example|your\.release\.url)\b/i.test(content)) {
    addFinding(findings, "error", relativePath, "placeholder-value", "Placeholder domain or email remains in a changed file.");
  }

  if (/\b(TODO|FIXME|HACK)\b/i.test(content) && isSourceFile(relativePath)) {
    addFinding(findings, "warn", relativePath, "temporary-marker", "Temporary TODO/FIXME/HACK marker remains in source.");
  }

  if (extension === ".tsx" || extension === ".jsx") {
    if (/style=\{\{/.test(content)) {
      addFinding(findings, "error", relativePath, "inline-style", "JSX inline style remains in changed code; prefer module CSS or an existing style utility.");
    }
    if (/\{\/\*[\s\S]*?<[\w][\s\S]*?\*\/\}/.test(content)) {
      addFinding(findings, "error", relativePath, "commented-code", "Commented-out JSX code remains in changed code.");
    }
  }

  if (extension === ".css" && /\/\*[\s\S]*?\.[A-Za-z_][\w-]*\s*\{[\s\S]*?\}[\s\S]*?\*\//.test(content)) {
    addFinding(findings, "error", relativePath, "commented-css", "Commented-out CSS rules remain in changed code.");
  }

  if (isSourceFile(relativePath) && /[\u{1F300}-\u{1FAFF}]/u.test(content)) {
    addFinding(findings, "warn", relativePath, "emoji", "Emoji remains in source; keep UI copy intentional and accessible.");
  }

  return findings;
}

function getAddedDiffText(repoRoot: string, relativePath: string) {
  const diff = spawnSync("git", ["diff", "--unified=0", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  const stdout = diff.stdout || "";
  const addedLines = stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
  return addedLines.join("\n");
}

function isTrackedFile(repoRoot: string, relativePath: string) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  return result.status === 0;
}

function main() {
  const { runId, roles } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);
  const targetFiles = collectTargetFiles(manifest, roles);
  const findings: Finding[] = [];

  for (const relativePath of targetFiles) {
    const absolutePath = path.join(manifest.repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const addedDiffText = getAddedDiffText(manifest.repoRoot, relativePath);
    const content = addedDiffText || (isTrackedFile(manifest.repoRoot, relativePath) ? "" : fs.readFileSync(absolutePath, "utf8"));
    if (!content) {
      continue;
    }
    findings.push(...scanFile(relativePath, content));
  }

  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warnCount = findings.filter((finding) => finding.severity === "warn").length;
  const report = {
    runId: manifest.runId,
    roles: roles ?? "all",
    checkedFiles: targetFiles,
    status: errorCount > 0 ? "failed" : "passed",
    errorCount,
    warnCount,
    findings,
  };

  const reportPath = path.join(manifest.runDir, "meta", "quality-gate.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("# Runner Quality Gate");
  console.log(`Run ID: ${manifest.runId}`);
  console.log(`Checked files: ${targetFiles.length}`);
  console.log(`Status: ${report.status}`);
  console.log(`Findings: errors=${errorCount}, warnings=${warnCount}`);
  console.log(`Report: ${reportPath}`);

  for (const finding of findings.slice(0, 12)) {
    console.log(`- ${finding.severity.toUpperCase()} ${finding.file} [${finding.rule}]: ${finding.message}`);
  }
  if (findings.length > 12) {
    console.log(`- ... ${findings.length - 12} more finding(s) omitted from terminal output.`);
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

main();
