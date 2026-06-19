export type OpenAIReasoningEffort = "minimal" | "low" | "medium" | "high";

const reasoningEfforts = new Set(["minimal", "low", "medium", "high"]);
const reasoningModelPrefixes = [
  "gpt-5",
  "o1",
  "o3",
  "o4",
];

export function parseOpenAIReasoningEffort(value: string | undefined, label: string) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "none") {
    return undefined;
  }

  if (!reasoningEfforts.has(normalized)) {
    throw new Error(`${label} must be one of: minimal, low, medium, high, none.`);
  }

  return normalized as OpenAIReasoningEffort;
}

export function supportsOpenAIReasoning(model: string) {
  const normalized = model.trim().toLowerCase();
  return reasoningModelPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`));
}

export function openAIReasoningRequestPart(model: string, effort: OpenAIReasoningEffort | undefined) {
  if (!effort) {
    return {};
  }

  if (process.env.OPENAI_FORCE_REASONING === "true" || supportsOpenAIReasoning(model)) {
    return { reasoning: { effort } };
  }

  return {};
}

export function describeOpenAIReasoning(model: string, requestedValue: string | undefined) {
  const effort = parseOpenAIReasoningEffort(requestedValue, "reasoning");
  if (!effort) {
    return "default";
  }

  if (process.env.OPENAI_FORCE_REASONING === "true" || supportsOpenAIReasoning(model)) {
    return effort;
  }

  return `${effort} (not sent: unsupported by ${model})`;
}
