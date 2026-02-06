import { z } from 'zod';

/**
 * Environment configuration schema with validation
 */
export const configSchema = z.object({
  // Required fields
  PIPELINE_TRIGGER_TOKEN: z.string().min(1, 'PIPELINE_TRIGGER_TOKEN is required'),
  PIPELINE_PROJECT_ID: z.string().min(1, 'PIPELINE_PROJECT_ID is required'),

  // Optional fields with defaults
  PIPELINE_REF: z.string().default('main'),
  GITLAB_API_BASE: z.string().url().default('https://gitlab.com'),
  WEBHOOK_SECRET_TOKEN: z.string().optional(),
  FALLBACK_TARGET_BRANCH: z.string().default('main'),
  ORIGINAL_NEEDS_MAX_CHARS: z.coerce.number().int().positive().default(8192),
  COPILOT_AGENT_USERNAME: z.string().default('copilot-gitlab-agent'),
  COPILOT_AGENT_COMMIT_EMAIL: z.string().email().default('copilot@github.com'),
  ENABLE_INLINE_REVIEW_COMMENTS: z
    .string()
    .transform((val) => val.toLowerCase() === 'true' || val === '1')
    .default('true'),
  // Language for Copilot-generated content. If not set, dynamic detection from GitLab user preferences is attempted.
  COPILOT_LANGUAGE: z.string().optional(),
  COPILOT_MODEL: z.string().default('gpt-4.1'),
  LISTEN_HOST: z.string().default('0.0.0.0'),
  LISTEN_PORT: z.coerce.number().int().positive().default(8080),
  LOG_DEBUG: z
    .string()
    .transform((val) => val.toLowerCase() === 'true' || val === '1')
    .default('false'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid configuration');
  }

  return result.data;
}
