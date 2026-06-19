import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const smokeFile = path.join(orchestratorRoot, ".docs-encoding-smoke.md");

  try {
    fs.writeFileSync(smokeFile, "# Encoding Smoke\n\n?꾨줈?앺듃 媛\n", "utf8");
    const child = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/runnerDocsEncodingGate.ts", "--compact"], {
      cwd: orchestratorRoot,
      encoding: "utf8",
      stdio: "pipe",
    });

    const combinedOutput = `${child.stdout || ""}\n${child.stderr || ""}`;
    if (child.status === 0) {
      throw new Error("Docs encoding gate smoke failed: intentionally broken Markdown was not rejected.");
    }

    if (!combinedOutput.includes("possible-korean-mojibake") || !combinedOutput.includes("missing-utf8-bom")) {
      throw new Error(`Docs encoding gate smoke failed: expected rules were not reported.\n${combinedOutput}`);
    }

    console.log("# Runner Docs Encoding Smoke");
    console.log("Status: ok");
    console.log("Broken Markdown fixture was rejected as expected.");
  } finally {
    fs.rmSync(smokeFile, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
