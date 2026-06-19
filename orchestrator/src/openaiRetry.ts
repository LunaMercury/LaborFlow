type RetryableError = Error & {
  status?: number;
};

type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPositiveInt(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRetryConfig(): RetryConfig {
  return {
    maxRetries: readPositiveInt("OPENAI_MAX_RETRIES", 6),
    baseDelayMs: readPositiveInt("OPENAI_RETRY_BASE_MS", 3_000),
    maxDelayMs: readPositiveInt("OPENAI_RETRY_MAX_MS", 60_000),
  };
}

function isRetryableOpenAIError(error: unknown) {
  const maybeError = error as Partial<RetryableError>;
  const message = error instanceof Error ? error.message : String(error);

  return (
    maybeError.status === 429 ||
    (typeof maybeError.status === "number" && maybeError.status >= 500 && maybeError.status <= 599) ||
    /\b429\b/.test(message) ||
    /\b5\d\d\b/.test(message) ||
    /upstream/i.test(message) ||
    /connection error/i.test(message) ||
    /fetch failed/i.test(message) ||
    /network/i.test(message) ||
    /timeout/i.test(message) ||
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(message) ||
    /rate limit/i.test(message) ||
    /try again/i.test(message)
  );
}

function parseRetryDelayMs(message: string) {
  const secondsMatch =
    message.match(/try again in\s+([0-9.]+)s/i) ||
    message.match(/retry-after=([0-9.]+)s/i);

  if (secondsMatch) {
    return Math.ceil(Number.parseFloat(secondsMatch[1]) * 1000);
  }

  const millisMatch = message.match(/retry-after=([0-9.]+)ms/i);
  if (millisMatch) {
    return Math.ceil(Number.parseFloat(millisMatch[1]));
  }

  return undefined;
}

function getBackoffDelayMs(error: unknown, attempt: number, config: RetryConfig) {
  const message = error instanceof Error ? error.message : String(error);
  const retryAfterMs = parseRetryDelayMs(message);
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(config.maxDelayMs, retryAfterMs + 500);
  }

  const exponential = config.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(config.maxDelayMs, exponential);
}

export async function withOpenAIRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const config = getRetryConfig();
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableOpenAIError(error) || attempt > config.maxRetries) {
        throw error;
      }

      const delayMs = getBackoffDelayMs(error, attempt, config);
      console.warn(`${label} rate-limited; retrying in ${delayMs}ms (${attempt}/${config.maxRetries})`);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
