import fs from "node:fs";
import path from "node:path";

type Args = {
  targetProjectRoot: string;
};

const requiredFiles = [
  ".gitignore",
  "초기설정.txt",
  "AGENTS.md",
  "agent_role.md",
  "security_guidelines.md",
  "system_architecture.md",
  path.join(".skills", "verify-all.ps1"),
  path.join(".skills", "verify-web.ps1"),
  path.join(".skills", "verify-core.ps1"),
  path.join(".skills", "verify-fast.ps1"),
  path.join(".skills", "verify-mobile.ps1"),
  path.join("orchestrator", "package.json"),
  path.join("orchestrator", "package-lock.json"),
  path.join("orchestrator", "tsconfig.json"),
  path.join("orchestrator", "README.md"),
  path.join("orchestrator", "OPERATIONS_GUIDE.md"),
  path.join("orchestrator", "BOILERPLATE_SPLIT_GUIDE.md"),
  path.join("orchestrator", "BOILERPLATE_MIGRATION_CHECKLIST.md"),
  path.join("orchestrator", "config", "project.yaml"),
  path.join("orchestrator", "config", "project-templates.yaml"),
  path.join("orchestrator", "src", "runnerFull.ts"),
  path.join("orchestrator", "src", "runnerWorkflow.ts"),
  path.join("orchestrator", "src", "runnerDoctor.ts"),
  path.join("orchestrator", "src", "runnerDocsEncodingGate.ts"),
  path.join("orchestrator", "src", "runnerDocsEncodingSmoke.ts"),
  path.join("orchestrator", "src", "projectPackage.ts"),
  path.join("orchestrator", "src", "projectRehearsePackage.ts"),
  path.join("orchestrator", "src", "projectValidatePackage.ts"),
];

const forbiddenPaths = [
  ".env",
  ".env.local",
  path.join("orchestrator", ".env"),
  path.join("orchestrator", ".env.local"),
  path.join("orchestrator", "PIPELINE_STATUS.md"),
  path.join("orchestrator", ".git"),
];

const runtimeArtifactPaths = [
  path.join("orchestrator", "runs"),
  path.join("orchestrator", "dist"),
  path.join("orchestrator", "node_modules"),
];

const requiredScripts = [
  "ci:dry-run",
  "runner:plan",
  "runner:plan:budget",
  "runner:plan:mock",
  "runner:goal",
  "runner:goal:budget",
  "runner:goal:mock",
  "runner:rehearse",
  "runner:apply",
  "runner:reuse-apply",
  "runner:status",
  "runner:status:compact",
  "runner:latest",
  "runner:latest:any",
  "runner:latest:mock",
  "runner:latest:quick",
  "runner:latest:quick:any",
  "runner:latest:quick:mock",
  "runner:latest:status",
  "runner:latest:status:compact",
  "runner:latest:continue",
  "runner:latest:continue:compact",
  "runner:latest:a",
  "runner:latest:b",
  "runner:latest:c",
  "runner:latest:a:execute",
  "runner:latest:b:execute",
  "runner:continue",
  "runner:continue:compact",
  "runner:continue:a",
  "runner:continue:b",
  "runner:continue:c",
  "runner:continue:a:execute",
  "runner:continue:b:execute",
  "runner:full",
  "runner:full:safe",
  "runner:full:balanced",
  "runner:full:rehearse",
  "runner:workflow",
  "runner:workflow:safe",
  "runner:workflow:balanced",
  "runner:workflow:rehearse",
  "runner:workflow:reuse",
  "runner:doctor",
  "runner:preflight",
  "runner:preflight:compact",
  "runner:readiness",
  "runner:readiness:compact",
  "runner:readiness:strict",
  "runner:argument-guard:smoke",
  "runner:accept-guard:smoke",
  "runner:accept-unlock:smoke",
  "runner:docs-encoding",
  "runner:docs-encoding:smoke",
  "runner:help",
  "runner:quality",
  "runner:quality:smoke",
  "runner:workflow:quality-smoke",
  "runner:reports",
  "runner:reports:any",
  "runner:reports:live",
  "runner:reports:mock",
  "runner:quick",
  "runner:quick:any",
  "runner:quick:mock",
  "runner:accept",
  "runner:accept:preview",
  "project:package",
  "project:rehearse-package",
  "project:validate-package",
];

function usage(): never {
  throw new Error("Usage: npm run project:validate-package -- --target <project-root>");
}

function parseArgs(argv: string[]): Args {
  let targetProjectRoot = "";
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--target") {
      targetProjectRoot = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }
    usage();
  }
  if (!targetProjectRoot) {
    usage();
  }
  return { targetProjectRoot };
}

function exists(targetProjectRoot: string, relativePath: string) {
  return fs.existsSync(path.join(targetProjectRoot, relativePath));
}

function looksLikeSourceProject(targetProjectRoot: string) {
  return exists(targetProjectRoot, path.join("orchestrator", "PIPELINE_STATUS.md"))
    || exists(targetProjectRoot, ".env")
    || exists(targetProjectRoot, ".env.local");
}

function readPackageJson(targetProjectRoot: string) {
  const packageJsonPath = path.join(targetProjectRoot, "orchestrator", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  return packageJson;
}

function main() {
  const { targetProjectRoot } = parseArgs(process.argv.slice(2));
  const failures: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(targetProjectRoot)) {
    throw new Error(`Target project root does not exist: ${targetProjectRoot}`);
  }

  for (const relativePath of requiredFiles) {
    if (!exists(targetProjectRoot, relativePath)) {
      failures.push(`missing required file: ${relativePath}`);
    }
  }

  for (const relativePath of forbiddenPaths) {
    if (exists(targetProjectRoot, relativePath)) {
      failures.push(`forbidden packaged path exists: ${relativePath}`);
    }
  }

  for (const relativePath of runtimeArtifactPaths) {
    if (exists(targetProjectRoot, relativePath)) {
      warnings.push(`runtime artifact path exists: ${relativePath}`);
    }
  }

  if (exists(targetProjectRoot, path.join("orchestrator", "package.json"))) {
    const packageJson = readPackageJson(targetProjectRoot);
    for (const scriptName of requiredScripts) {
      if (!packageJson.scripts?.[scriptName]) {
        failures.push(`missing package script: ${scriptName}`);
      }
    }
  }

  console.log("# Project Package Validation");
  console.log(`Target project: ${targetProjectRoot}`);
  console.log(`Required files checked: ${requiredFiles.length}`);
  console.log(`Forbidden paths checked: ${forbiddenPaths.length}`);
  console.log(`Runtime artifact paths checked: ${runtimeArtifactPaths.length}`);
  console.log(`Required scripts checked: ${requiredScripts.length}`);

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    console.log("Runtime artifacts are expected after npm install, build, or ci:dry-run. Validate a clean target right after project:package if you need strict copy-only confirmation.");
  }

  if (failures.length > 0) {
    console.log("");
    console.log("Validation failed:");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    if (looksLikeSourceProject(targetProjectRoot)) {
      console.log("");
      console.log("Hint:");
      console.log("- This target looks like the source project, not a packaged boilerplate copy.");
      console.log("- project:validate-package is intended for a target created by project:package.");
      console.log("- To rehearse packaging safely, run: npm run project:rehearse-package");
      console.log("- To validate a copied target, run: npm run project:validate-package -- --target \"<packaged project root>\"");
    }
    process.exit(1);
  }

  console.log("");
  console.log("Package validation passed.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
