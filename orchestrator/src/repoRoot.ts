import fs from "node:fs";
import path from "node:path";

export function resolveRepoRoot(fromDir: string) {
  const repoRoot = path.resolve(fromDir, "../..");
  const markers = [
    "AGENTS.md",
    ".git",
    ".skills",
    "run-windows.bat",
    "run-linux.sh",
  ];
  const hasMarker = markers.some((marker) => fs.existsSync(path.join(repoRoot, marker)));

  if (!hasMarker) {
    throw new Error(
      [
        `Could not find the repository root from ${repoRoot}`,
        "Expected at least one project marker: AGENTS.md, .git, .skills, run-windows.bat, or run-linux.sh.",
      ].join("\n"),
    );
  }

  return repoRoot;
}
