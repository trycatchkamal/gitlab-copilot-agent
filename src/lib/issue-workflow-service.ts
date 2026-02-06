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

export interface IssueWorkflowRequest {
  gitlabToken: string;
  targetRepoUrl: string;
  targetBranch: string;
  sourceBranch?: string;
  issueTitle: string;
  issueIid: number;
  issueDescription: string;
  targetProjectId: number;
  targetProjectPath: string;
  issueUrl: string;
  gitlabBaseUrl: string;
  ciPipelineUrl?: string;
  copilotAgentUsername?: string;
  copilotAgentEmail?: string;
  issueAuthorId?: number;
  issueAssigneeUsername?: string;
  model?: string;
}

/**
 * Service to handle Issue Assignment Workflow
 * 1. Plan TODOs
 * 2. Create Branch
 * 3. Create MR (with MR-exists detection)
 * 4. Implement changes
 */
export class IssueWorkflowService {
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

  async processIssue(request: IssueWorkflowRequest, logger: FastifyBaseLogger): Promise<void> {
    return this.queue.add(() => this.performWorkflow(request, logger));
  }

  private async performWorkflow(
    request: IssueWorkflowRequest,
    logger: FastifyBaseLogger,
  ): Promise<void> {
    const gitlabApi = new GitLabApi({
      baseUrl: request.gitlabBaseUrl,
      token: request.gitlabToken,
      projectId: request.targetProjectId,
    });

    // Create PromptLoader with automatic language detection
    const promptLoader = await PromptLoader.createForUser(gitlabApi, request.issueAuthorId, logger);
    logger.debug({ language: promptLoader.getLanguage() }, 'Using language for prompts');

    let tempDir: string | null = null;
    let sessionId: string | null = null;

    try {
      logger.info({ issueIid: request.issueIid }, 'Starting Issue Workflow');

      // 1. Post Acknowledgment
      const ackBody = await this.buildAckMessage(request, promptLoader);
      await gitlabApi.postIssueComment(request.issueIid, ackBody, logger);

      // 2. Generate Plan (with retry)
      sessionId = `issue-plan-${request.targetProjectId}-${request.issueIid}`;
      const planSession = await this.copilotClient.createSession({
        sessionId,
        model: request.model || 'gpt-4.1',
      });

      const planPrompt = await promptLoader.load('plan_todo', {
        issue_title: request.issueTitle,
        issue_iid: request.issueIid.toString(),
        project_path: request.targetProjectPath,
        issue_url: request.issueUrl,
        issue_description: request.issueDescription,
      });

      logger.info('Generating plan...');
      const planResponse = await withRetry(
        async () => {
          const resp = await planSession.sendAndWait({ prompt: planPrompt }, 3600000);
          if (!resp) throw new Error('Copilot failed to generate plan');
          return resp;
        },
        logger,
        { ...COPILOT_RETRY_OPTIONS, operationName: 'Copilot plan generation' },
      );

      // Parse Plan
      const planText = stripAnsi(planResponse.data.content);
      const plan = this.parsePlan(planText);

      await planSession.destroy();

      logger.info({ branch: plan.branch }, 'Plan generated');

      // 3. Create Branch & MR
      await gitlabApi.createBranch(plan.branch, request.targetBranch, logger);

      const mr = await gitlabApi.createMergeRequest(
        plan.branch,
        request.targetBranch,
        `${request.issueTitle} (#${request.issueIid})`,
        this.buildMrDescription(plan.todo, request),
        logger,
      );

      // If MR already existed, notify and halt workflow
      if (!mr.created) {
        logger.warn({ mrUrl: mr.web_url }, 'MR already exists, halting workflow');
        const mrExistsBody = await promptLoader.load('mr_exists', {
          mr_url: mr.web_url,
          copilot_username: request.copilotAgentUsername ?? 'copilot-gitlab-agent',
          assigner_username: request.issueAssigneeUsername ?? 'unknown',
        });
        await gitlabApi.postIssueComment(request.issueIid, mrExistsBody, logger);
        return;
      }

      // 4. Implement Tasks
      tempDir = await mkdtemp(join(tmpdir(), 'issue-impl-'));
      const git = simpleGit();

      const url = new URL(request.targetRepoUrl);
      url.username = 'oauth2';
      url.password = request.gitlabToken;

      await git.clone(url.toString(), tempDir);
      const repoGit = simpleGit(tempDir);

      await repoGit.fetch();
      await repoGit.checkout(plan.branch);

      const repoFiles = await this.getRepoFiles(repoGit);

      // Implementation Session (with retry)
      const implSession = await this.copilotClient.createSession({
        sessionId: `issue-impl-${request.issueIid}`,
        model: request.model || 'gpt-4.1',
      });

      sessionId = implSession.sessionId;

      const implPrompt = await promptLoader.load('implement', {
        repo_path: tempDir,
        branch_name: plan.branch,
        target_branch: request.targetBranch,
        repo_files: repoFiles,
        todo_list: plan.todo,
      });

      logger.info('Generating implementation...');
      await withRetry(
        async () => {
          const resp = await implSession.sendAndWait({ prompt: implPrompt }, 3600000);
          if (!resp) throw new Error('Copilot failed to generate implementation');
          return resp;
        },
        logger,
        { ...COPILOT_RETRY_OPTIONS, operationName: 'Copilot implementation' },
      );

      // Check changes (selective staging, filtering intermediate files)
      const { hasChanges } = await stageFilesSelectively(repoGit, logger);

      if (!hasChanges) {
        logger.warn('No changes generated by Copilot');
      } else {
        // Generate commit message
        const diffStat = await repoGit.diff(['--cached', '--stat']);
        const commitMsgPrompt = await promptLoader.load('commit_msg', {
          changes_summary: diffStat,
        });

        const commitMsgResponse = await implSession.sendAndWait({ prompt: commitMsgPrompt }, 60000);
        const commitMsg = stripAnsi(
          commitMsgResponse?.data.content || 'feat: implement changes from copilot automation',
        ).trim();

        await repoGit.addConfig('user.name', request.copilotAgentUsername || 'Copilot');
        await repoGit.addConfig('user.email', request.copilotAgentEmail || 'copilot@github.com');
        await repoGit.commit(commitMsg);

        // Push with retry (3 attempts, 5s delay)
        await pushWithRetry(repoGit, plan.branch, logger);

        logger.info('Pushed changes');
      }

      // 5. Update MR & Complete
      const completedTodo = plan.todo.replace(/\[ \]/g, '[x]');

      await gitlabApi.updateMergeRequest(
        mr.iid,
        {
          description: this.buildMrDescription(completedTodo, request),
          reviewer_ids: request.issueAuthorId ? [request.issueAuthorId] : undefined,
        },
        logger,
      );

      const completionBody = await promptLoader.load('mr_completion', {
        mr_url: mr.web_url,
      });
      await gitlabApi.postIssueComment(request.issueIid, completionBody, logger);

      await implSession.destroy();
    } catch (error) {
      logger.error({ error }, 'Issue Workflow Failed');
      await gitlabApi.postIssueComment(request.issueIid, `❌ Automation failed: ${error}`, logger);
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
    request: IssueWorkflowRequest,
    promptLoader: PromptLoader,
  ): Promise<string> {
    let msg = await promptLoader.load('issue_ack');
    if (request.ciPipelineUrl) {
      msg += `\n\n---\n- [🔗 Copilot Coding Session](${request.ciPipelineUrl})`;
    }
    return msg;
  }

  private parsePlan(text: string): { branch: string; todo: string } {
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        return { branch: data.branch, todo: data.todo_markdown };
      } catch {
        /* fall through */
      }
    }
    try {
      const data = JSON.parse(text);
      return { branch: data.branch, todo: data.todo_markdown };
    } catch {
      throw new Error('Could not parse plan from Copilot response');
    }
  }

  private buildMrDescription(todo: string, request: IssueWorkflowRequest): string {
    let desc = `## TODO\n${todo}\n\n---\n- Original issue: ${request.issueUrl}`;
    if (request.ciPipelineUrl) {
      desc += `\n- [🔗 Copilot Coding Session](${request.ciPipelineUrl})`;
    }
    return desc;
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
