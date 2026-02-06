import { Gitlab } from '@gitbeaker/rest';
import type { FastifyBaseLogger } from 'fastify';

export interface GitLabApiOptions {
  baseUrl: string;
  token: string;
  projectId: number;
}

export interface InlineDiscussionPosition {
  baseSha: string;
  startSha: string;
  headSha: string;
  newPath: string;
  newLine: number;
}

/**
 * GitLab language code to our i18n language code mapping.
 * GitLab uses full locale codes, we use ISO 639-1 codes.
 */
const GITLAB_LANGUAGE_MAP: Record<string, string> = {
  en: 'en',
  'en-US': 'en',
  'en-GB': 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  zh: 'zh',
  ja: 'ja',
  'ja-JP': 'ja',
  ko: 'ko',
  'ko-KR': 'ko',
  th: 'th',
  'th-TH': 'th',
  hi: 'hi',
  'hi-IN': 'hi',
  ar: 'ar',
  'ar-SA': 'ar',
};

/**
 * GitLab API client using @gitbeaker/rest
 */
export class GitLabApi {
  private readonly client: InstanceType<typeof Gitlab>;
  private readonly projectId: number;

  constructor(options: GitLabApiOptions) {
    this.client = new Gitlab({
      host: options.baseUrl,
      token: options.token,
    });
    this.projectId = options.projectId;
  }

  /**
   * Post a comment to a merge request
   */
  async postMrComment(mrIid: number, body: string, logger?: FastifyBaseLogger): Promise<void> {
    try {
      await this.client.MergeRequestNotes.create(this.projectId, mrIid, body);
      logger?.debug({ mrIid }, 'Posted comment to MR');
    } catch (error) {
      logger?.error({ error, mrIid }, 'Error posting MR comment');
      throw error;
    }
  }

  /**
   * Post an issue comment
   */
  async postIssueComment(
    issueIid: number,
    body: string,
    logger?: FastifyBaseLogger,
  ): Promise<void> {
    try {
      await this.client.IssueNotes.create(this.projectId, issueIid, body);
      logger?.debug({ issueIid }, 'Posted comment to issue');
    } catch (error) {
      logger?.error({ error, issueIid }, 'Error posting issue comment');
      throw error;
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string, ref: string, logger?: FastifyBaseLogger): Promise<void> {
    try {
      await this.client.Branches.create(this.projectId, branchName, ref);
      logger?.info({ branchName, ref }, 'Created new branch');
    } catch (error: any) {
      if (
        error?.message?.includes('already exists') ||
        error?.description?.includes('already exists')
      ) {
        logger?.info({ branchName }, 'Branch already exists');
        return;
      }
      logger?.error({ error, branchName }, 'Error creating branch');
      throw error;
    }
  }

  /**
   * Create a merge request
   */
  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string,
    logger?: FastifyBaseLogger,
  ): Promise<{ iid: number; web_url: string; created: boolean }> {
    try {
      const mr = await this.client.MergeRequests.create(
        this.projectId,
        sourceBranch,
        targetBranch,
        title,
        { description },
      );
      logger?.info({ mrIid: mr.iid }, 'Created merge request');
      return { iid: mr.iid, web_url: mr.web_url as string, created: true };
    } catch (error: any) {
      // Handle MR already exists (409)
      if (
        error?.description?.includes('already exists') ||
        error?.cause?.description?.includes('already exists')
      ) {
        logger?.warn('MR might already exist, attempting to find it');
        const existing = await this.client.MergeRequests.all({
          projectId: this.projectId,
          sourceBranch: sourceBranch,
          state: 'opened',
        });
        if (existing.length > 0) {
          return { iid: existing[0].iid, web_url: existing[0].web_url as string, created: false };
        }
      }
      logger?.error({ error }, 'Error creating merge request');
      throw error;
    }
  }

  /**
   * Post an inline discussion comment to a merge request.
   * Uses GitLab Discussions API with position for line-level comments.
   * Returns true if posted successfully, false on failure (non-throwing for graceful fallback).
   */
  async postInlineDiscussion(
    mrIid: number,
    body: string,
    position: InlineDiscussionPosition,
    logger?: FastifyBaseLogger,
  ): Promise<boolean> {
    try {
      await this.client.MergeRequestDiscussions.create(this.projectId, mrIid, body, {
        position: {
          base_sha: position.baseSha,
          start_sha: position.startSha,
          head_sha: position.headSha,
          position_type: 'text',
          new_path: position.newPath,
          new_line: position.newLine,
        },
      } as any);
      logger?.debug(
        { mrIid, file: position.newPath, line: position.newLine },
        'Posted inline discussion',
      );
      return true;
    } catch (error) {
      logger?.warn(
        { error, mrIid, file: position.newPath, line: position.newLine },
        'Failed to post inline discussion',
      );
      return false;
    }
  }

  /**
   * Update a merge request
   */
  async updateMergeRequest(
    mrIid: number,
    updates: { description?: string; reviewer_ids?: number[] },
    logger?: FastifyBaseLogger,
  ): Promise<void> {
    try {
      await this.client.MergeRequests.edit(this.projectId, mrIid, updates);
      logger?.debug({ mrIid }, 'Updated merge request');
    } catch (error) {
      logger?.error({ error, mrIid }, 'Error updating merge request');
      throw error;
    }
  }

  /**
   * Get user's preferred language from GitLab user preferences.
   * Returns the mapped i18n language code, or 'en' as fallback.
   *
   * @param userId - The GitLab user ID
   * @param logger - Optional logger
   * @returns The i18n language code (e.g., 'en', 'ja', 'zh')
   */
  async getUserLanguage(userId: number, logger?: FastifyBaseLogger): Promise<string> {
    try {
      const user = await this.client.Users.show(userId);
      const gitlabLang = (user as any).preferred_language || 'en';

      // Map GitLab locale to our i18n code
      const mappedLang = GITLAB_LANGUAGE_MAP[gitlabLang];
      if (mappedLang) {
        logger?.debug({ userId, gitlabLang, mappedLang }, 'Detected user language');
        return mappedLang;
      }

      // Try extracting base language code (e.g., 'es-MX' -> 'es')
      const baseLang = gitlabLang.split('-')[0];
      if (GITLAB_LANGUAGE_MAP[baseLang]) {
        logger?.debug(
          { userId, gitlabLang, mappedLang: GITLAB_LANGUAGE_MAP[baseLang] },
          'Detected user language (base)',
        );
        return GITLAB_LANGUAGE_MAP[baseLang];
      }

      logger?.debug({ userId, gitlabLang }, 'User language not supported, using English');
      return 'en';
    } catch (error) {
      logger?.warn({ error, userId }, 'Failed to fetch user language, using English');
      return 'en';
    }
  }
}
