import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { GitLabApi } from './gitlab-api.js';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Resolve the prompts directory.
 * Supports multiple environments:
 * - PROMPTS_DIR env var (explicit override)
 * - __dirname-based (CJS / ts-jest / tsx dev mode)
 * - process.cwd()-based (ESM production / Docker)
 */
function getPromptsDir(): string {
  if (process.env.PROMPTS_DIR) {
    return process.env.PROMPTS_DIR;
  }

  // __dirname is available in CJS (Jest/ts-jest) and tsx dev mode
  // In ESM production builds, __dirname is not available
  if (typeof __dirname !== 'undefined') {
    return join(__dirname, '..', '..', 'prompts');
  }

  // ESM fallback: resolve from working directory
  // In Docker (WORKDIR /app), npm scripts, and CI pipelines,
  // the working directory is the project root
  return resolve('prompts');
}

/** Supported language codes */
export const SUPPORTED_LANGUAGES = ['en', 'ar', 'hi', 'ja', 'ko', 'th', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Load and process i18n prompt templates
 */
export class PromptLoader {
  private readonly promptsDir: string;
  private readonly language: string;

  constructor(language = 'en', logger?: FastifyBaseLogger) {
    this.promptsDir = getPromptsDir();
    const validated = this.validateLanguage(language);
    if (validated !== language) {
      logger?.warn(
        { requested: language, fallback: validated, supported: SUPPORTED_LANGUAGES },
        `Language '${language}' is not supported, falling back to '${validated}'`,
      );
    }
    this.language = validated;
  }

  /**
   * Create a PromptLoader with automatic language selection.
   *
   * Logic:
   * 1. If COPILOT_LANGUAGE env var is set → use it (explicit override)
   * 2. If not set and userId provided → detect from GitLab user preferences
   * 3. Fallback to 'en' if detection fails or no userId
   *
   * @param gitlabApi - GitLab API client
   * @param userId - GitLab user ID to detect language for
   * @param logger - Optional logger
   * @returns PromptLoader configured with the appropriate language
   */
  static async createForUser(
    gitlabApi: GitLabApi,
    userId: number | undefined,
    logger?: FastifyBaseLogger,
  ): Promise<PromptLoader> {
    const explicitLang = process.env.COPILOT_LANGUAGE;

    // If COPILOT_LANGUAGE is explicitly set, use it
    if (explicitLang) {
      logger?.debug({ language: explicitLang }, 'Using explicit COPILOT_LANGUAGE');
      return new PromptLoader(explicitLang, logger);
    }

    // Try dynamic detection if we have a user ID
    if (userId) {
      try {
        const detectedLang = await gitlabApi.getUserLanguage(userId, logger);
        logger?.info({ userId, language: detectedLang }, 'Detected user language from GitLab');
        return new PromptLoader(detectedLang, logger);
      } catch (error) {
        logger?.warn({ error, userId }, 'Failed to detect user language, using English');
      }
    } else {
      logger?.debug('No userId provided for language detection, using English');
    }

    return new PromptLoader('en', logger);
  }

  /**
   * Get the current language code
   */
  getLanguage(): string {
    return this.language;
  }

  private validateLanguage(lang: string): string {
    return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage) ? lang : 'en';
  }

  async load(templateName: string, variables: Record<string, string> = {}): Promise<string> {
    const templatePath = join(this.promptsDir, this.language, `${templateName}.txt`);

    try {
      let content = await readFile(templatePath, 'utf-8');

      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        content = content.replaceAll(placeholder, value);
      }

      return content;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(
          `Prompt template '${templateName}' not found for language '${this.language}'`,
        );
      }
      throw error;
    }
  }
}
