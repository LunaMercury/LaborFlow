import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDir = path.resolve(__dirname, "../config");

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function loadYamlConfig<T>(fileName: string): T {
  const filePath = path.join(configDir, fileName);
  return parse(fs.readFileSync(filePath, "utf8")) as T;
}

function mergeValues(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(override)) {
    return [...base, ...override];
  }

  if (isObject(base) && isObject(override)) {
    const result: JsonObject = { ...base };
    for (const [key, value] of Object.entries(override)) {
      result[key] = key in result
        ? mergeValues(result[key], value)
        : value;
    }
    return result;
  }

  return override ?? base;
}

export function mergeConfig<T>(base: T, override: Partial<T>): T {
  return mergeValues(base, override) as T;
}
