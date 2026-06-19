import fs from "node:fs";
import path from "node:path";
import type { RunnerManifest } from "./packetStore.js";

export type ApiUsageStage = "worker" | "apply";

export type ApiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  raw: unknown;
};

export type ApiUsageRecord = {
  runId: string;
  recordedAt: string;
  stage: ApiUsageStage;
  role: string;
  provider: "openai";
  model: string;
  usage: ApiUsage;
};

export type ApiUsageSummary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  records: ApiUsageRecord[];
};

export type ApiUsageCostSummary = {
  estimatedUsd: number;
  pricedCalls: number;
  unpricedCalls: number;
  unpricedModels: string[];
};

type ModelTokenPrice = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type ApiUsageBreakdownItem = {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
};

export type ApiUsageBreakdown = {
  byStage: ApiUsageBreakdownItem[];
  byRole: ApiUsageBreakdownItem[];
  byStageRole: ApiUsageBreakdownItem[];
};

const defaultModelPrices: Record<string, ModelTokenPrice> = {
  "gpt-4.1": { inputUsdPerMillion: 2, outputUsdPerMillion: 8 },
  "gpt-5": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  "gpt-5-mini": { inputUsdPerMillion: 0.25, outputUsdPerMillion: 2 },
  "gpt-5-nano": { inputUsdPerMillion: 0.05, outputUsdPerMillion: 0.4 },
  "gpt-5-pro": { inputUsdPerMillion: 15, outputUsdPerMillion: 120 },
};

function usageFilePath(manifest: RunnerManifest) {
  return path.join(manifest.runDir, "meta", "api-usage.json");
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function extractOpenAIUsage(payload: unknown): ApiUsage | undefined {
  const usage = (payload as { usage?: Record<string, unknown> })?.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const inputTokens = toNumber(usage.input_tokens);
  const outputTokens = toNumber(usage.output_tokens);
  const totalTokens = toNumber(usage.total_tokens) || inputTokens + outputTokens;

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    raw: usage,
  };
}

export function readApiUsageRecords(manifest: RunnerManifest): ApiUsageRecord[] {
  const filePath = usageFilePath(manifest);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { records?: ApiUsageRecord[] };
  return Array.isArray(parsed.records) ? parsed.records : [];
}

export function appendApiUsageRecord(manifest: RunnerManifest, record: Omit<ApiUsageRecord, "runId" | "recordedAt">) {
  const records = readApiUsageRecords(manifest);
  records.push({
    ...record,
    runId: manifest.runId,
    recordedAt: new Date().toISOString(),
  });

  const filePath = usageFilePath(manifest);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ records }, null, 2)}\n`, "utf8");
}

export function summarizeApiUsage(manifest: RunnerManifest): ApiUsageSummary {
  const records = readApiUsageRecords(manifest);
  return {
    calls: records.length,
    inputTokens: records.reduce((sum, record) => sum + record.usage.inputTokens, 0),
    outputTokens: records.reduce((sum, record) => sum + record.usage.outputTokens, 0),
    totalTokens: records.reduce((sum, record) => sum + record.usage.totalTokens, 0),
    records,
  };
}

function readPricingOverrides() {
  const raw = process.env.OPENAI_MODEL_PRICING_JSON;
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as Record<string, { input?: number; output?: number }>;
  return Object.fromEntries(
    Object.entries(parsed).flatMap(([model, price]) => {
      if (typeof price.input !== "number" || typeof price.output !== "number") {
        return [];
      }

      return [[model.toLowerCase(), {
        inputUsdPerMillion: price.input,
        outputUsdPerMillion: price.output,
      } satisfies ModelTokenPrice]];
    }),
  );
}

function getModelPrice(model: string, overrides: Record<string, ModelTokenPrice>) {
  const normalized = model.toLowerCase();
  return overrides[normalized] ?? defaultModelPrices[normalized];
}

export function estimateApiUsageCost(apiUsage: ApiUsageSummary): ApiUsageCostSummary {
  const overrides = readPricingOverrides();
  let estimatedUsd = 0;
  let pricedCalls = 0;
  const unpricedModels = new Set<string>();

  for (const record of apiUsage.records) {
    const price = getModelPrice(record.model, overrides);
    if (!price) {
      unpricedModels.add(record.model);
      continue;
    }

    estimatedUsd +=
      (record.usage.inputTokens / 1_000_000) * price.inputUsdPerMillion
      + (record.usage.outputTokens / 1_000_000) * price.outputUsdPerMillion;
    pricedCalls += 1;
  }

  return {
    estimatedUsd,
    pricedCalls,
    unpricedCalls: apiUsage.records.length - pricedCalls,
    unpricedModels: [...unpricedModels].sort(),
  };
}

function estimateRecordCost(record: ApiUsageRecord, overrides: Record<string, ModelTokenPrice>) {
  const price = getModelPrice(record.model, overrides);
  if (!price) {
    return 0;
  }

  return (
    (record.usage.inputTokens / 1_000_000) * price.inputUsdPerMillion
    + (record.usage.outputTokens / 1_000_000) * price.outputUsdPerMillion
  );
}

function summarizeRecordsBy(
  records: ApiUsageRecord[],
  keyOf: (record: ApiUsageRecord) => string,
  overrides: Record<string, ModelTokenPrice>,
): ApiUsageBreakdownItem[] {
  const items = new Map<string, ApiUsageBreakdownItem>();

  for (const record of records) {
    const key = keyOf(record);
    const current = items.get(key) ?? {
      key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedUsd: 0,
    };

    current.calls += 1;
    current.inputTokens += record.usage.inputTokens;
    current.outputTokens += record.usage.outputTokens;
    current.totalTokens += record.usage.totalTokens;
    current.estimatedUsd += estimateRecordCost(record, overrides);
    items.set(key, current);
  }

  return [...items.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function summarizeApiUsageBreakdown(apiUsage: ApiUsageSummary): ApiUsageBreakdown {
  const overrides = readPricingOverrides();
  return {
    byStage: summarizeRecordsBy(apiUsage.records, (record) => record.stage, overrides),
    byRole: summarizeRecordsBy(apiUsage.records, (record) => record.role, overrides),
    byStageRole: summarizeRecordsBy(apiUsage.records, (record) => `${record.stage}:${record.role}`, overrides),
  };
}

export function formatEstimatedUsd(value: number) {
  if (value === 0) {
    return "$0.0000";
  }

  if (value < 0.0001) {
    return `$${value.toFixed(6)}`;
  }

  return `$${value.toFixed(4)}`;
}
