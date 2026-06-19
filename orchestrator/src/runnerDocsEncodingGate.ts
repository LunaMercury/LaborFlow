import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Finding = {
  file: string;
  line: number;
  rule: string;
  detail: string;
  excerpt: string;
};

type Args = {
  compact: boolean;
};

const ignoredDirectories = new Set([
  ".git",
  ".gradle",
  ".gradle-user-home",
  ".idea",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "runs",
  "target",
]);

const suspiciousTokens = [
  "\uFFFD",
  "?꾨",
  "?ㅼ",
  "?섍",
  "?몄",
  "?대",
  "?뺤",
  "?댁",
  "?덈",
  "?쓣",
  "?뒗",
  "?섎",
  "?⑸",
  "?땲",
  "?낅",
  "?덉",
  "?꾩",
  "媛",
  "蹂",
  "遺",
  "吏",
  "諛",
  "怨",
  "湲",
  "洹",
  "濡",
  "嫄",
  "沅",
  "肄",
  "鍮",
  "寃",
  "援",
  "쒖",
  "쒕",
  "쒗",
];

function parseArgs(argv: string[]): Args {
  return {
    compact: argv.includes("--compact") || argv.includes("--summary-only"),
  };
}

function hasUtf8Bom(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function hasNonAscii(text: string) {
  return /[^\x00-\x7F]/.test(text);
}

function toRelative(repoRoot: string, filePath: string) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function walkMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function findLine(text: string, token: string) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(token));
  if (index < 0) {
    return { line: 1, excerpt: "" };
  }

  const excerpt = lines[index].trim().replace(/\s+/g, " ");
  return {
    line: index + 1,
    excerpt: excerpt.length > 140 ? `${excerpt.slice(0, 137)}...` : excerpt,
  };
}

function inspectFile(repoRoot: string, filePath: string): Finding[] {
  const relativePath = toRelative(repoRoot, filePath);
  const buffer = fs.readFileSync(filePath);
  const text = buffer.toString("utf8");
  const findings: Finding[] = [];

  if (hasNonAscii(text) && !hasUtf8Bom(buffer)) {
    findings.push({
      file: relativePath,
      line: 1,
      rule: "missing-utf8-bom",
      detail: "Korean/non-ASCII Markdown files must include a UTF-8 BOM for Windows PowerShell compatibility.",
      excerpt: text.split(/\r?\n/)[0]?.trim() || "(empty first line)",
    });
  }

  for (const token of suspiciousTokens) {
    if (!text.includes(token)) {
      continue;
    }

    const { line, excerpt } = findLine(text, token);
    findings.push({
      file: relativePath,
      line,
      rule: token === "\uFFFD" ? "replacement-character" : "possible-korean-mojibake",
      detail: `Suspicious token detected: ${JSON.stringify(token)}`,
      excerpt,
    });
  }

  return findings;
}

function printFindings(findings: Finding[], compact: boolean) {
  if (findings.length === 0) {
    return;
  }

  console.log("");
  console.log("Findings:");
  for (const finding of findings) {
    if (compact) {
      console.log(`- ${finding.file}:${finding.line} ${finding.rule} - ${finding.detail}`);
      continue;
    }

    console.log(`- ${finding.file}:${finding.line}`);
    console.log(`  rule: ${finding.rule}`);
    console.log(`  detail: ${finding.detail}`);
    if (finding.excerpt) {
      console.log(`  excerpt: ${finding.excerpt}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const orchestratorRoot = path.resolve(__dirname, "..");
  const repoRoot = path.resolve(orchestratorRoot, "..");
  const files = walkMarkdownFiles(repoRoot);
  const findings = files.flatMap((file) => inspectFile(repoRoot, file));

  console.log("# Runner Docs Encoding Gate");
  console.log(`Repo: ${repoRoot}`);
  console.log(`Markdown files checked: ${files.length}`);
  console.log(`Findings: ${findings.length}`);

  printFindings(findings, args.compact);

  if (findings.length > 0) {
    console.log("");
    console.log("Status: failed");
    console.log("Fix: save affected Markdown files as UTF-8 with BOM and remove mojibake text before packaging or applying changes.");
    process.exit(1);
  }

  console.log("Status: ok");
}

main();
