import path from "node:path";

export function normalizeRepoRelativePath(candidate: string) {
  const normalized = candidate.replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
    return undefined;
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return undefined;
  }

  return segments.join("/");
}

function normalizePathRule(rule: string) {
  return rule.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function matchesRepoPathRule(repoRelativePath: string, rule: string) {
  const normalizedPath = normalizeRepoRelativePath(repoRelativePath);
  const normalizedRule = normalizePathRule(rule);
  if (!normalizedPath || !normalizedRule) {
    return false;
  }

  if (normalizedRule.endsWith("/**")) {
    const prefix = normalizedRule.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }

  if (normalizedRule.endsWith("/*")) {
    const prefix = normalizedRule.slice(0, -2);
    const rest = normalizedPath.startsWith(`${prefix}/`) ? normalizedPath.slice(prefix.length + 1) : "";
    return Boolean(rest) && !rest.includes("/");
  }

  return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
}

export function resolveRepoPath(repoRoot: string, repoRelativePath: string) {
  const normalizedPath = normalizeRepoRelativePath(repoRelativePath);
  if (!normalizedPath) {
    throw new Error(`Unsafe repository-relative path: ${repoRelativePath}`);
  }

  const resolvedRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(resolvedRoot, normalizedPath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path resolves outside the repository or to its root: ${repoRelativePath}`);
  }

  return {
    normalizedPath,
    resolvedPath,
  };
}

export function assertSamePathSet(label: string, expectedPaths: string[], actualPaths: string[]) {
  const expected = new Set(expectedPaths);
  const actual = new Set(actualPaths);
  const duplicates = actualPaths.filter((item, index) => actualPaths.indexOf(item) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate paths: ${Array.from(new Set(duplicates)).join(", ")}`);
  }

  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} does not match the approved file set. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`,
    );
  }
}
