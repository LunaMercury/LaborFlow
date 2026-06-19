import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Step = {
  name: string;
  script: string;
  args: string[];
  required: boolean;
};

function parseArgs(argv: string[]) {
  return {
    compact: argv.includes("--compact") || argv.includes("--summary-only"),
    strict: argv.includes("--strict"),
  };
}

function runNodeScript(orchestratorRoot: string, script: string, args: string[]) {
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCli, path.join(orchestratorRoot, "src", script), ...args], {
    cwd: orchestratorRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

function firstUsefulLine(output: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(">"));
  return lines.find((line) => /^(WARN|FAIL)\b/.test(line))
    || lines.find((line) => /^Status:\s*(warning|failed)\b/.test(line))
    || lines.find((line) => !line.startsWith("#"))
    || lines[0]
    || "";
}

function hasWarning(output: string) {
  return /^WARN\b/m.test(output) || /^Status:\s*warning\b/m.test(output);
}

function main() {
  const { compact, strict } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const steps: Step[] = [
    {
      name: "preflight",
      script: "runnerPreflight.ts",
      args: ["--compact", ...(strict ? ["--strict"] : [])],
      required: strict,
    },
    {
      name: "doctor",
      script: "runnerDoctor.ts",
      args: ["--compact", ...(strict ? ["--strict"] : [])],
      required: strict,
    },
    {
      name: "docs encoding",
      script: "runnerDocsEncodingGate.ts",
      args: ["--compact"],
      required: true,
    },
    {
      name: "argument guard",
      script: "runnerArgumentGuardSmoke.ts",
      args: [],
      required: true,
    },
    {
      name: "accept guard",
      script: "runnerAcceptGuardSmoke.ts",
      args: [],
      required: true,
    },
  ];

  const results = steps.map((step) => {
    const result = runNodeScript(orchestratorRoot, step.script, step.args);
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    return {
      ...step,
      status: result.status ?? 1,
      output,
      warning: result.status === 0 && hasWarning(output),
    };
  });

  const blockingFailures = results.filter((result) => result.status !== 0 && result.required);
  const warnings = results.filter((result) => (result.status !== 0 && !result.required) || result.warning);

  console.log("# Runner Readiness");
  console.log(`Strict warnings: ${strict ? "yes" : "no"}`);
  console.log("API cost: $0.0000 (no provider calls)");
  console.log("");

  for (const result of results) {
    const status = result.status === 0 && !result.warning ? "OK" : result.required && result.status !== 0 ? "FAIL" : "WARN";
    console.log(`${status} ${result.name}: exit=${result.status}`);
    if (!compact && result.output.trim()) {
      console.log(result.output.trim());
      console.log("");
    } else if (compact && (result.status !== 0 || result.warning)) {
      console.log(`  ${firstUsefulLine(result.output)}`);
    }
  }

  console.log("");
  console.log("## Summary");
  console.log(`Status: ${blockingFailures.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "ok"}`);
  console.log(`Steps: ok=${results.filter((result) => result.status === 0 && !result.warning).length}, warn=${warnings.length}, fail=${blockingFailures.length}`);
  console.log("");
  console.log("Next live chain:");
  console.log('1. npm run runner:goal -- --roles frontend "request"');
  console.log("2. npm run runner:quick");
  console.log("3. npm run runner:accept");

  if (blockingFailures.length > 0) {
    process.exit(1);
  }
}

main();
