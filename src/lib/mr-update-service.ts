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
import { stageFilesSelectively, pushWithRetry } from './git-helpers.js';
import PQueue from 'p-queue';

export interface MrUpdateRequest {
  gitlabToken: string;
  targetRepoUrl: string;
  targetBranch: string;
  sourceBranch: string;
  targetMrIid: number;
  instruction: string;
  targetProjectId: number;
  gitlabBaseUrl: string;
  ciPipelineUrl?: string;
  copilotAgentUsername?: string;
  copilotAgentEmail?: string;
  model?: string;
  /** User ID for dynamic language detection (typically the commenter) */
  userId?: number;
}

/**
 * Service to handle MR Updates based on comments
 */
export class MrUpdateService {
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

  async processUpdate(request: MrUpdateRequest, logger: FastifyBaseLogger): Promise<void> {
    return this.queue.add(() => this.performUpdate(request, logger));
  }

  private async performUpdate(request: MrUpdateRequest, logger: FastifyBaseLogger): Promise<void> {
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
      logger.info({ mrIid: request.targetMrIid }, 'Starting MR Update Workflow');

      // 1. Post Acknowledgment
      const ackBody = await this.buildAckMessage(request, promptLoader);
      await gitlabApi.postMrComment(request.targetMrIid, ackBody, logger);

      // 2. Clone & Setup
      tempDir = await mkdtemp(join(tmpdir(), 'mr-update-'));
      const git = simpleGit();

      const url = new URL(request.targetRepoUrl);
      url.username = 'oauth2';
      url.password = request.gitlabToken;

      await git.clone(url.toString(), tempDir);
      const repoGit = simpleGit(tempDir);

      await repoGit.fetch();
      await repoGit.checkout(request.sourceBranch);

      const repoFiles = await this.getRepoFiles(repoGit);

      // 3. Generate Update (with retry)
      sessionId = `mr-update-${request.targetMrIid}`;
      const session = await this.copilotClient.createSession({
        sessionId,
        model: request.model || 'gpt-4.1',
      });

      const updatePrompt = await promptLoader.load('mr_update', {
        repo_path: tempDir,
        branch_name: request.sourceBranch,
        target_branch: request.targetBranch,
        repo_files: repoFiles,
        user_instruction: request.instruction,
      });

      logger.info('Generating updates...');
      await withRetry(
        async () => {
          const resp = await session.sendAndWait({ prompt: updatePrompt }, 3600000);
          if (!resp) throw new Error('Copilot failed to generate updates');
          return resp;
        },
        logger,
        { ...COPILOT_RETRY_OPTIONS, operationName: 'Copilot MR update' },
      );

      // Check changes (selective staging, filtering intermediate files)
      const { hasChanges } = await stageFilesSelectively(repoGit, logger);

      if (!hasChanges) {
        logger.warn('No changes generated');
        const noChangeMsg = await promptLoader.load('mr_no_changes', {
          user_instruction: request.instruction,
        });
        await gitlabApi.postMrComment(
          request.targetMrIid,
          this.appendPipelineLink(noChangeMsg, request),
          logger,
        );
      } else {
        // Commit Message
        const diffStat = await repoGit.diff(['--cached', '--stat']);
        const commitMsgPrompt = await promptLoader.load('commit_msg', {
          changes_summary: diffStat,
        });

        const commitMsgResponse = await session.sendAndWait({ prompt: commitMsgPrompt }, 60000);
        const commitMsg = stripAnsi(
          commitMsgResponse?.data.content || 'feat: apply updates from MR note',
        ).trim();

        await repoGit.addConfig('user.name', request.copilotAgentUsername || 'Copilot');
        await repoGit.addConfig('user.email', request.copilotAgentEmail || 'copilot@github.com');
        await repoGit.commit(commitMsg);

        // Push with retry (3 attempts, 5s delay)
        await pushWithRetry(repoGit, request.sourceBranch, logger);

        logger.info('Pushed changes');

        // Generate Summary
        const log = await repoGit.log(['-1', '--oneline']);
        const summaryPrompt = await promptLoader.load('mr_summary', {
          commit_log: log.all[0].hash + ' ' + log.all[0].message,
          changes_stat: diffStat,
        });
        const summaryResp = await session.sendAndWait({ prompt: summaryPrompt }, 60000);
        const summary = stripAnsi(
          summaryResp?.data.content || `Applied changes: ${request.instruction}`,
        );

        // Completion Note
        let completionMsg = await promptLoader.load('mr_update_completion', {
          change_summary: summary,
          commit_message: commitMsg,
        });
        completionMsg = this.appendPipelineLink(completionMsg, request);

        await gitlabApi.postMrComment(request.targetMrIid, completionMsg, logger);
      }

      await session.destroy();
    } catch (error) {
      logger.error({ error }, 'MR Update Failed');
      await gitlabApi.postMrComment(request.targetMrIid, `❌ MR Update failed: ${error}`, logger);
      throw error;
    } finally {
      if (sessionId) {
        try {
          await this.copilotClient.deleteSession(sessionId);
        } catch {
          /* ignore */
        }
      }
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }

  private async buildAckMessage(
    request: MrUpdateRequest,
    promptLoader: PromptLoader,
  ): Promise<string> {
    const msg = await promptLoader.load('issue_ack');
    return this.appendPipelineLink(msg, request);
  }

  private appendPipelineLink(msg: string, request: MrUpdateRequest): string {
    if (request.ciPipelineUrl) {
      return msg + `\n\n---\n- [🔗 Copilot Coding Session](${request.ciPipelineUrl})`;
    }
    return msg;
  }

  private async getRepoFiles(git: SimpleGit): Promise<string> {
    const files = await git.raw(['ls-files']);
    return files
      .split('\n')
      .filter((f) => !f.includes('node_modules') && f.length > 0)
      .slice(0, 50)
      .join(', ');
  }
}
