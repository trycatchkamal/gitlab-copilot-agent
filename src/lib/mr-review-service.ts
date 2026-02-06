import { CopilotClient } from '@github/copilot-sdk';
import { simpleGit, type SimpleGit } from 'simple-git';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import stripAnsi from 'strip-ansi';
import type { FastifyBaseLogger } from 'fastify';
import { PromptLoader } from './prompt-loader.js';
import { GitLabApi } from './gitlab-api.js';
import { withRetry, COPILOT_RETRY_OPTIONS } from './retry.js';
import PQueue from 'p-queue';

export interface MrReviewRequest {
  gitlabToken: string;
  targetRepoUrl: string;
  targetBranch: string;
  sourceBranch: string;
  targetMrIid: number;
  mrTitle: string;
  mrDescription: string;
  targetProjectId: number;
  gitlabBaseUrl: string;
  ciPipelineUrl?: string;
  language?: string;
  enableInlineComments?: boolean;
  model?: string;
  /** User ID for dynamic language detection (typically the MR author or reviewer requester) */
  userId?: number;
}

export interface ReviewFinding {
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  category: 'security' | 'performance' | 'quality' | 'testing' | 'documentation';
  file: string;
  line: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReviewResult {
  summary: string;
  recommendation: 'APPROVE' | 'REQUEST_CHANGES' | 'NEEDS_DISCUSSION';
  findings: ReviewFinding[];
}

interface GitDiffResult {
  diff: string;
  changedFiles: string;
  commitMessages: string;
  baseSha: string;
  headSha: string;
  startSha: string;
}

/**
 * MR Review Service using GitHub Copilot SDK
 * Handles concurrent review requests with queue management.
 * Supports both general review comments and inline discussion comments.
 */
export class MrReviewService {
  private readonly copilotClient: CopilotClient;
  private readonly queue: PQueue;
  private isClientStarted = false;

  constructor(concurrency = 3) {
    this.copilotClient = new CopilotClient();
    this.queue = new PQueue({ concurrency });
  }

  async start(): Promise<void> {
    if (!this.isClientStarted) {
      await this.copilotClient.start();
      this.isClientStarted = true;
    }
  }

  async stop(): Promise<void> {
    if (this.isClientStarted) {
      await this.queue.onIdle();
      await this.copilotClient.stop();
      this.isClientStarted = false;
    }
  }

  async reviewMergeRequest(request: MrReviewRequest, logger: FastifyBaseLogger): Promise<void> {
    return this.queue.add(() => this.performReview(request, logger));
  }

  private async performReview(request: MrReviewRequest, logger: FastifyBaseLogger): Promise<void> {
    const gitlabApi = new GitLabApi({
      baseUrl: request.gitlabBaseUrl,
      token: request.gitlabToken,
      projectId: request.targetProjectId,
    });

    // Create PromptLoader with automatic language detection
    const promptLoader = await PromptLoader.createForUser(gitlabApi, request.userId, logger);
    logger.debug({ language: promptLoader.getLanguage() }, 'Using language for prompts');

    let tempDir: string | null = null;
    let sessionId: string | null = null;

    try {
      logger.info(
        { mrIid: request.targetMrIid, mrTitle: request.mrTitle },
        'Starting MR code review',
      );

      // 1. Post acknowledgment comment
      const ackMessage = await this.buildAckMessage(request, promptLoader);
      await gitlabApi.postMrComment(request.targetMrIid, ackMessage, logger);

      // 2. Clone repository and get diff + SHAs
      tempDir = await mkdtemp(join(tmpdir(), 'mr-review-'));
      const gitResult = await this.getGitDiff(request, tempDir, logger);

      // 3. Check if there are changes
      if (!gitResult.diff || gitResult.diff.trim().length === 0) {
        logger.warn({ mrIid: request.targetMrIid }, 'No changes found in MR');
        const noChangeMessage = await this.buildNoChangeMessage(request);
        await gitlabApi.postMrComment(request.targetMrIid, noChangeMessage, logger);
        return;
      }

      // 4. Create Copilot session
      const session = await this.copilotClient.createSession({
        sessionId: `mr-review-${request.targetProjectId}-${request.targetMrIid}`,
        model: request.model || 'gpt-4.1',
      });
      sessionId = session.sessionId;

      logger.info({ sessionId }, 'Created Copilot session');

      // 5. Build review prompt
      const reviewPrompt = await promptLoader.load('code_review', {
        mr_title: request.mrTitle,
        mr_description: request.mrDescription || 'No description provided',
        source_branch: request.sourceBranch,
        target_branch: request.targetBranch,
        changed_files: gitResult.changedFiles,
        commit_messages: gitResult.commitMessages,
        code_diff: gitResult.diff,
      });

      logger.info('Sending review request to Copilot');

      // 6. Send review request with retry (3 attempts, 10s delay)
      const response = await withRetry(
        async () => {
          const resp = await session.sendAndWait({ prompt: reviewPrompt }, 3600000);
          if (!resp) throw new Error('No response received from Copilot');
          return resp;
        },
        logger,
        { ...COPILOT_RETRY_OPTIONS, operationName: 'Copilot code review' },
      );

      // 7. Clean ANSI codes from response
      const cleanContent = stripAnsi(response.data.content);

      logger.info('Received review response from Copilot');

      // 8. Post review (inline or general)
      if (request.enableInlineComments) {
        const reviewResult = this.parseReviewFindings(cleanContent);
        if (reviewResult) {
          const summaryBody = await this.postInlineFindings(
            gitlabApi,
            request.targetMrIid,
            reviewResult,
            gitResult.baseSha,
            gitResult.startSha,
            gitResult.headSha,
            request.ciPipelineUrl,
            logger,
          );
          await gitlabApi.postMrComment(request.targetMrIid, summaryBody, logger);
        } else {
          logger.warn('Could not parse structured review findings, posting general comment');
          const reviewBody = this.buildReviewComment(cleanContent, request.ciPipelineUrl);
          await gitlabApi.postMrComment(request.targetMrIid, reviewBody, logger);
        }
      } else {
        const reviewBody = this.buildReviewComment(cleanContent, request.ciPipelineUrl);
        await gitlabApi.postMrComment(request.targetMrIid, reviewBody, logger);
      }

      logger.info({ mrIid: request.targetMrIid }, 'MR code review completed successfully');

      // 9. Cleanup session
      await session.destroy();
    } catch (error) {
      logger.error({ error, mrIid: request.targetMrIid }, 'MR code review failed');

      try {
        const errorMessage = `🤖 **Code Review Failed**\n\n❌ An error occurred during the review process:\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\``;
        await gitlabApi.postMrComment(request.targetMrIid, errorMessage, logger);
      } catch (commentError) {
        logger.error({ error: commentError }, 'Failed to post error comment');
      }

      throw error;
    } finally {
      if (sessionId) {
        try {
          await this.copilotClient.deleteSession(sessionId);
        } catch (error) {
          logger.warn({ error, sessionId }, 'Failed to delete session');
        }
      }

      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch (error) {
          logger.warn({ error, tempDir }, 'Failed to cleanup temp directory');
        }
      }
    }
  }

  /**
   * Clone repo and get git diff + commit SHAs for inline comment positioning
   */
  private async getGitDiff(
    request: MrReviewRequest,
    workDir: string,
    logger: FastifyBaseLogger,
  ): Promise<GitDiffResult> {
    const git: SimpleGit = simpleGit();

    const url = new URL(request.targetRepoUrl);
    url.username = 'oauth2';
    url.password = request.gitlabToken;

    logger.debug({ workDir }, 'Cloning repository');
    await git.clone(url.toString(), workDir, ['--quiet']);

    const repoGit = simpleGit(workDir);

    logger.debug('Fetching branches');
    await repoGit.fetch(['origin', request.sourceBranch, request.targetBranch, '--quiet']);
    await repoGit.checkout(request.sourceBranch, ['--quiet']);

    // Get commit SHAs for inline comment positioning
    const baseSha = (await repoGit.revparse([`origin/${request.targetBranch}`])).trim();
    const headSha = (await repoGit.revparse([`origin/${request.sourceBranch}`])).trim();
    const startSha = (
      await repoGit.raw([
        'merge-base',
        `origin/${request.targetBranch}`,
        `origin/${request.sourceBranch}`,
      ])
    ).trim();

    logger.debug({ baseSha, headSha, startSha }, 'Resolved commit SHAs');

    // Get diff
    const diffRange = `origin/${request.targetBranch}...${request.sourceBranch}`;
    const diff = await repoGit.diff([diffRange]);

    // Get changed files
    const diffSummary = await repoGit.diffSummary([diffRange]);
    const changedFiles = diffSummary.files.map((f) => f.file).join(', ');

    // Get commit messages
    const log = await repoGit.log({
      from: `origin/${request.targetBranch}`,
      to: request.sourceBranch,
    });
    const commitMessages = log.all.map((c) => `${c.hash.substring(0, 8)} ${c.message}`).join('\n');

    logger.debug(
      { changedFilesCount: diffSummary.files.length, commitsCount: log.all.length },
      'Git diff retrieved',
    );

    return { diff, changedFiles, commitMessages, baseSha, headSha, startSha };
  }

  /**
   * Parse structured review findings from Copilot response.
   * Tries JSON block in markdown, then raw JSON.
   */
  private parseReviewFindings(content: string): ReviewResult | null {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]) as ReviewResult;
      } catch {
        /* fall through */
      }
    }
    try {
      return JSON.parse(content) as ReviewResult;
    } catch {
      return null;
    }
  }

  /**
   * Post inline review comments and build summary.
   * Returns the final summary body to post as a general comment.
   */
  private async postInlineFindings(
    gitlabApi: GitLabApi,
    mrIid: number,
    result: ReviewResult,
    baseSha: string,
    startSha: string,
    headSha: string,
    ciPipelineUrl: string | undefined,
    logger: FastifyBaseLogger,
  ): Promise<string> {
    const severityEmoji: Record<string, string> = {
      critical: '🔴',
      major: '🟠',
      minor: '🟡',
      suggestion: '💡',
    };

    let inlineCount = 0;
    const failedInlines: ReviewFinding[] = [];

    for (const finding of result.findings) {
      if (!finding.file || finding.line <= 0) {
        failedInlines.push(finding);
        continue;
      }

      const emoji = severityEmoji[finding.severity] ?? 'ℹ️';
      const commentBody = [
        `${emoji} **${finding.severity.toUpperCase()}**: ${finding.title}`,
        '',
        '---',
        `- **Category**: ${finding.category}`,
        `- **Issue**: ${finding.description}`,
        `- **Suggestion**: ${finding.suggestion}`,
      ].join('\n');

      const posted = await gitlabApi.postInlineDiscussion(
        mrIid,
        commentBody,
        {
          baseSha,
          startSha,
          headSha,
          newPath: finding.file,
          newLine: finding.line,
        },
        logger,
      );

      if (posted) {
        inlineCount++;
      } else {
        failedInlines.push(finding);
      }
    }

    logger.info(
      { inlineCount, failedCount: failedInlines.length },
      'Inline comment posting complete',
    );

    // Build summary
    const lines = [
      `## 🤖 Copilot Code Review Summary`,
      '',
      `**Overall Assessment**: ${result.summary}`,
      '',
      '---',
      `- **Recommendation**: **${result.recommendation}**`,
      `- **Review Statistics**:`,
      `  - 🔴 Critical: ${result.findings.filter((f) => f.severity === 'critical').length}`,
      `  - 🟠 Major: ${result.findings.filter((f) => f.severity === 'major').length}`,
      `  - 🟡 Minor: ${result.findings.filter((f) => f.severity === 'minor').length}`,
      `  - 💡 Suggestions: ${result.findings.filter((f) => f.severity === 'suggestion').length}`,
      `- **Total Issues Found**: ${result.findings.length}`,
      `- **Inline Comments Posted**: ${inlineCount}`,
    ];

    if (failedInlines.length > 0) {
      lines.push('');
      lines.push('### ⚠️ Additional Findings');
      lines.push('');
      lines.push('The following issues could not be posted as inline comments:');
      lines.push('');

      for (const f of failedInlines) {
        const emoji = severityEmoji[f.severity] ?? 'ℹ️';
        lines.push(`${emoji} **${f.severity.toUpperCase()}**: ${f.title}`);
        lines.push('');
        lines.push('---');
        lines.push(`- **File**: \`${f.file}:${f.line}\``);
        lines.push(`- **Issue**: ${f.description}`);
        lines.push(`- **Suggestion**: ${f.suggestion}`);
        lines.push('');
      }
    }

    if (ciPipelineUrl) {
      lines.push('');
      lines.push('---');
      lines.push(`- [🔗 Review Session](${ciPipelineUrl})`);
    }

    return lines.join('\n');
  }

  private async buildAckMessage(
    request: MrReviewRequest,
    promptLoader: PromptLoader,
  ): Promise<string> {
    let message = await promptLoader.load('review_ack');

    if (request.ciPipelineUrl) {
      message += `\n\n---\n- [🔗 Review Session](${request.ciPipelineUrl})`;
    }

    return message;
  }

  private async buildNoChangeMessage(request: MrReviewRequest): Promise<string> {
    let message = `🤖 No code changes detected between **${request.targetBranch}** and **${request.sourceBranch}**.\n\nThe branches appear to be in sync.`;

    if (request.ciPipelineUrl) {
      message += `\n\n---\n- [🔗 Review Session](${request.ciPipelineUrl})`;
    }

    return message;
  }

  private buildReviewComment(reviewContent: string, ciPipelineUrl?: string): string {
    let body = `## 🤖 Copilot Code Review\n\n${reviewContent}`;

    if (ciPipelineUrl) {
      body += `\n\n---\n- [🔗 Review Session](${ciPipelineUrl})`;
    }

    return body;
  }

  getQueueStats() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
    };
  }
}
