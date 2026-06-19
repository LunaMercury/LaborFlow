import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRunnerManifest } from "./packetStore.js";
import type { WorkerTaskPacket } from "./taskSchemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SupportedProvider = "claude" | "openai" | "manual";

type Args = {
  runId: string;
  provider: SupportedProvider;
  roles?: WorkerTaskPacket["role"][];
  continueOnError: boolean;
};

function parseArgs(argv: string[]): Args {
  const filtered = [...argv];
  const providerIndex = filtered.findIndex((item) => item === "--provider");
  const rolesIndex = filtered.findIndex((item) => item === "--roles");
  const continueOnError = filtered.includes("--continue-on-error");

  let provider: SupportedProvider = (process.env.WORKER_PROVIDER as SupportedProvider) || "openai";
  let roles: WorkerTaskPacket["role"][] | undefined;

  if (providerIndex >= 0) {
    provider = filtered[providerIndex + 1] as SupportedProvider;
    filtered.splice(providerIndex, 2);
  }

  if (rolesIndex >= 0) {
    roles = filtered[rolesIndex + 1]
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is WorkerTaskPacket["role"] => ["frontend", "rust", "java", "mobile"].includes(item));
    filtered.splice(rolesIndex, 2);
  }

  const remaining = filtered.filter((item) => item !== "--continue-on-error");
  const [runId] = remaining;

  if (!runId) {
    throw new Error("Usage: npm run runner:execute -- <run-id> [--provider openai|claude|manual] [--roles frontend,java] [--continue-on-error]");
  }

  return {
    runId,
    provider,
    roles,
    continueOnError,
  };
}

function runNodeScript(scriptPath: string, scriptArgs: string[], cwd: string) {
  const tsxCliPath = path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs");
  return spawnSync(process.execPath, [tsxCliPath, scriptPath, ...scriptArgs], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function main() {
  const { runId, provider, roles, continueOnError } = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const manifest = readRunnerManifest(orchestratorRoot, runId);

  const targetWorkers = manifest.workers.filter((worker) => {
    return !roles || roles.includes(worker.role);
  });

  if (targetWorkers.length === 0) {
    throw new Error("No workers matched the requested roles.");
  }

  console.log(`# Runner Execute`);
  console.log(`Run ID: ${runId}`);
  console.log(`Provider: ${provider}`);
  console.log(`Workers: ${targetWorkers.map((item) => item.role).join(", ")}`);
  console.log("");

  for (const worker of targetWorkers) {
    console.log(`## Running ${worker.role}`);
    const child = runNodeScript(
      path.join("src", "workerRun.ts"),
      [runId, worker.role, "--provider", provider],
      orchestratorRoot,
    );

    if (child.stdout?.trim()) {
      console.log(child.stdout.trim());
    }
    if (child.stderr?.trim()) {
      console.error(child.stderr.trim());
    }
    if (child.error) {
      console.error(`spawn error: ${child.error.message}`);
    }
    if (child.signal) {
      console.error(`signal: ${child.signal}`);
    }

    if (child.status !== 0) {
      console.error(`worker ${worker.role} failed with exit code ${child.status}`);
      if (!continueOnError) {
        process.exit(child.status ?? 1);
      }
    }

    console.log("");
  }

  console.log(`## Collecting results`);
  const collect = runNodeScript(path.join("src", "collectResults.ts"), [runId], orchestratorRoot);
  if (collect.stdout?.trim()) {
    console.log(collect.stdout.trim());
  }
  if (collect.stderr?.trim()) {
    console.error(collect.stderr.trim());
  }
  if (collect.error) {
    console.error(`collect spawn error: ${collect.error.message}`);
  }
  if (collect.signal) {
    console.error(`collect signal: ${collect.signal}`);
  }

  if (collect.status !== 0) {
    process.exit(collect.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
