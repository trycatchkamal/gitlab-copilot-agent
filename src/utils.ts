import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Persist webhook payload to disk for debugging and audit purposes
 */
export async function persistPayload(payload: unknown, logger: FastifyBaseLogger): Promise<string> {
  try {
    const hooksDir = join(process.cwd(), 'hooks');
    await mkdir(hooksDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const payloadJson = JSON.stringify(payload, null, 2);
    const digest = createHash('sha1').update(payloadJson).digest('hex').slice(0, 10);

    const filename = `webhook-${timestamp}-${digest}.json`;
    const filepath = join(hooksDir, filename);

    await writeFile(filepath, payloadJson, 'utf-8');

    logger.info({ filepath }, 'Persisted webhook payload');
    return filepath;
  } catch (error) {
    logger.error({ error }, 'Failed to persist webhook payload');
    throw error;
  }
}

/**
 * Sanitize headers by redacting sensitive values
 */
export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set(['authorization', 'x-gitlab-token', 'private-token']);
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = sensitive.has(key.toLowerCase()) ? '***' : value;
  }

  return sanitized;
}

/**
 * Truncate text to a maximum length with a suffix
 */
export function truncateText(
  text: string,
  maxLength: number,
  suffix = '\n\n<!-- truncated -->',
): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncateAt = maxLength - suffix.length;
  return text.slice(0, truncateAt) + suffix;
}
