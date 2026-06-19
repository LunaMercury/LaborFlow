import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
  const orchestratorRoot = path.resolve(__dirname, "..");
  const tsxCli = path.join(orchestratorRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [
      tsxCli,
      path.join(orchestratorRoot, "src", "runnerFull.ts"),
      "java",
      "openai",
      "openai",
      "1",
      "네이버 로그인 기능을 만들어줘",
    ],
    {
      cwd: orchestratorRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const blocked = result.status !== 0 && output.includes("npm stripped your options");

  console.log("# Runner Argument Guard Smoke");
  console.log(`runner:full exit: ${result.status ?? "null"}`);
  console.log(`Suspicious stripped options blocked: ${blocked ? "yes" : "no"}`);

  if (!blocked) {
    console.log("");
    console.log(output.trim());
    process.exit(1);
  }
}

main();
