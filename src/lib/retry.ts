import type { FastifyBaseLogger } from 'fastify';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between retries in milliseconds (default: 10000) */
  delayMs?: number;
  /** Optional label for logging */
  operationName?: string;
  /**
   * Optional predicate: if the operation throws, should we retry?
   * Return false to abort immediately (e.g., timeout errors).
   * Default: always retry.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Execute an async function with retry logic.
 * Returns the result of fn() on success.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  logger?: FastifyBaseLogger,
  options?: RetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const delayMs = options?.delayMs ?? 10_000;
  const operationName = options?.operationName ?? 'operation';

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger?.info({ attempt, maxAttempts }, `${operationName}: attempt ${attempt}/${maxAttempts}`);
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (options?.shouldRetry && !options.shouldRetry(error, attempt)) {
        logger?.error({ attempt, error }, `${operationName}: non-retryable error`);
        throw error;
      }

      if (attempt < maxAttempts) {
        logger?.warn(
          { attempt, error, delayMs },
          `${operationName}: failed, retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
      } else {
        logger?.error({ attempt, error }, `${operationName}: failed after ${maxAttempts} attempts`);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Preset: Copilot SDK call retry (3 attempts, 10s delay) */
export const COPILOT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 10_000,
  operationName: 'Copilot SDK call',
};

/** Preset: git push retry (3 attempts, 5s delay) */
export const GIT_PUSH_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  delayMs: 5_000,
  operationName: 'git push',
};
