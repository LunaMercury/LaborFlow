import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");
  const runId = `run-quality-gate-smoke-${Date.now()}`;
  const runDir = path.join(orchestratorRoot, "runs", runId);
  const tasksDir = path.join(runDir, "tasks");
  const resultsDir = path.join(runDir, "results");
  const metaDir = path.join(runDir, "meta");
  const probeRelativePath = "orchestrator/.quality-gate-smoke.tsx";
  const probePath = path.join(repoRoot, probeRelativePath);

  try {
    fs.writeFileSync(
      probePath,
      [
        "export function QualityGateSmoke() {",
        "  return <div style={{ color: 'red' }}>{/* <span>dead code</span> */}whiteboard@service.example</div>;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const manifest = {
      runId,
      createdAt: new Date().toISOString(),
      request: "quality gate smoke",
      mode: "mock",
      repoRoot,
      runDir,
      tasksDir,
      resultsDir,
      reportPath: path.join(runDir, "report.md"),
      summaryPath: path.join(metaDir, "summary.json"),
      workers: [
        {
          role: "frontend",
          taskFile: path.join(tasksDir, "frontend.task.json"),
          resultFile: path.join(resultsDir, "frontend.result.json"),
          status: "succeeded",
        },
      ],
    };

    writeJson(path.join(metaDir, "manifest.json"), manifest);
    writeJson(path.join(metaDir, "summary.json"), { request: manifest.request });
    fs.writeFileSync(manifest.reportPath, "# Quality Gate Smoke\n", "utf8");
    writeJson(path.join(tasksDir, "frontend.task.json"), {
      role: "frontend",
      participationMode: "implement",
      goal: "quality gate smoke",
      allowedPaths: ["orchestrator/**"],
      blockedPaths: [],
      touchedAreas: [probeRelativePath],
      requiredVerification: [],
      contracts: [],
      expectedHandoff: ["changed_files"],
    });
    writeJson(path.join(resultsDir, "frontend.result.json"), {
      role: "frontend",
      status: "succeeded",
      changedFiles: [probeRelativePath],
      summary: "quality gate smoke",
      contractsChanged: [],
      verificationRun: [],
      risks: [],
      questions: [],
      proposedEdits: [
        {
          path: probeRelativePath,
          action: "create",
          summary: "quality gate smoke",
          instructions: ["contains intentionally bad patterns"],
        },
      ],
    });

    const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const result = spawnSync(
      process.execPath,
      [tsxCli, path.join(orchestratorRoot, "src", "runnerQualityGate.ts"), runId, "--roles", "frontend"],
      {
        cwd: orchestratorRoot,
        encoding: "utf8",
        windowsHide: true,
      },
    );

    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const expectedRules = ["placeholder-value", "inline-style", "commented-code"];
    const missingRules = expectedRules.filter((rule) => !output.includes(rule));
    const passed = result.status !== 0 && missingRules.length === 0;

    console.log("# Runner Quality Gate Smoke");
    console.log(`Quality gate exit: ${result.status}`);
    console.log(`Expected failure: ${passed ? "yes" : "no"}`);
    if (missingRules.length > 0) {
      console.log(`Missing rules: ${missingRules.join(", ")}`);
    }
    console.log(`Run dir: ${runDir}`);

    if (!passed) {
      console.log(output.trim());
      process.exit(1);
    }
  } finally {
    fs.rmSync(probePath, { force: true });
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

main();
