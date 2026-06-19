import fs from "node:fs";
import path from "node:path";

export interface RepoSnapshot {
  repoRoot: string;
  keyFiles: Record<string, string>;
  moduleFiles: Record<string, string[]>;
}

const MAX_FILE_PREVIEW = 4000;

function readFileIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8").slice(0, MAX_FILE_PREVIEW);
}

function collectFiles(baseDir: string, extensions: Set<string>): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const results: string[] = [];
  const stack = [baseDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!extensions.has(extension)) {
        continue;
      }

      results.push(fullPath);
    }
  }

  return results.sort();
}

function relativeList(repoRoot: string, files: string[]): string[] {
  return files.map((filePath) => path.relative(repoRoot, filePath).replaceAll("\\", "/"));
}

export function buildRepoSnapshot(repoRoot: string): RepoSnapshot {
  const keyFiles: Record<string, string> = {
    "AGENTS.md": readFileIfExists(path.join(repoRoot, "AGENTS.md")),
    "agent_role.md": readFileIfExists(path.join(repoRoot, "agent_role.md")),
    "security_guidelines.md": readFileIfExists(path.join(repoRoot, "security_guidelines.md")),
    "system_architecture.md": readFileIfExists(path.join(repoRoot, "system_architecture.md")),
    "troubleshooting.md": readFileIfExists(path.join(repoRoot, "troubleshooting.md")),
    "run.bat": readFileIfExists(path.join(repoRoot, "run.bat")),
    "stop.bat": readFileIfExists(path.join(repoRoot, "stop.bat")),
    ".env": readFileIfExists(path.join(repoRoot, ".env")),
    "web/package.json": readFileIfExists(path.join(repoRoot, "web", "package.json")),
    "web/frontend_context.md": readFileIfExists(path.join(repoRoot, "web", "frontend_context.md")),
    "web/css_rules.md": readFileIfExists(path.join(repoRoot, "web", "css_rules.md")),
    "backend-core/build.gradle": readFileIfExists(path.join(repoRoot, "backend-core", "build.gradle")),
    "backend-core/backend_core_context.md": readFileIfExists(path.join(repoRoot, "backend-core", "backend_core_context.md")),
    "backend-core/application.properties": readFileIfExists(
      path.join(repoRoot, "backend-core", "src", "main", "resources", "application.properties")
    ),
    "backend-fast/Cargo.toml": readFileIfExists(path.join(repoRoot, "backend-fast", "Cargo.toml")),
    "backend-fast/backend_fast_context.md": readFileIfExists(path.join(repoRoot, "backend-fast", "backend_fast_context.md")),
    "mobile/build.gradle": readFileIfExists(path.join(repoRoot, "mobile", "build.gradle")),
    "mobile/android_context.md": readFileIfExists(path.join(repoRoot, "mobile", "android_context.md")),
    "cloud/cloud_context.md": readFileIfExists(path.join(repoRoot, "cloud", "cloud_context.md")),
  };

  const moduleFiles: Record<string, string[]> = {
    frontend: relativeList(
      repoRoot,
      collectFiles(path.join(repoRoot, "web", "src"), new Set([".ts", ".tsx", ".css"]))
    ),
    rust: relativeList(
      repoRoot,
      collectFiles(path.join(repoRoot, "backend-fast", "src"), new Set([".rs"]))
    ),
    java: relativeList(
      repoRoot,
      collectFiles(path.join(repoRoot, "backend-core", "src"), new Set([".java", ".properties"]))
    ),
    mobile: relativeList(
      repoRoot,
      collectFiles(path.join(repoRoot, "mobile", "app", "src"), new Set([".kt", ".xml"]))
    ),
  };

  return {
    repoRoot,
    keyFiles,
    moduleFiles,
  };
}
