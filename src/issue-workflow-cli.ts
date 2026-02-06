#!/usr/bin/env node
import { IssueWorkflowService } from './lib/issue-workflow-service.js';
import pino from 'pino';

// Required environment variables
const requiredEnvVars = [
  'GITLAB_TOKEN',
  'TARGET_REPO_URL',
  'TARGET_BRANCH',
  'ISSUE_TITLE',
  'TARGET_ISSUE_IID',
  'ORIGINAL_NEEDS',
  'TARGET_PROJECT_ID',
  'TARGET_PROJECT_PATH',
  'ISSUE_URL',
] as const;

function validateEnv(): void {
  const missing: string[] = [];
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) missing.push(varName);
  }
  if (missing.length > 0) {
    console.error('[ERROR] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

async function main() {
  validateEnv();

  const logger = pino({
    level: process.env.LOG_DEBUG === 'true' ? 'debug' : 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  });

  const workflowService = new IssueWorkflowService(3);

  try {
    await workflowService.start();

    await workflowService.processIssue(
      {
        gitlabToken: process.env.GITLAB_TOKEN!,
        targetRepoUrl: process.env.TARGET_REPO_URL!,
        targetBranch: process.env.TARGET_BRANCH!,
        sourceBranch: process.env.SOURCE_BRANCH,
        issueTitle: process.env.ISSUE_TITLE!,
        issueIid: parseInt(process.env.TARGET_ISSUE_IID!, 10),
        issueDescription: process.env.ORIGINAL_NEEDS!,
        targetProjectId: parseInt(process.env.TARGET_PROJECT_ID!, 10),
        targetProjectPath: process.env.TARGET_PROJECT_PATH!,
        issueUrl: process.env.ISSUE_URL!,
        gitlabBaseUrl: process.env.UPSTREAM_GITLAB_BASE_URL || 'https://gitlab.com',
        ciPipelineUrl: process.env.CI_PIPELINE_URL,
        copilotAgentUsername: process.env.COPILOT_AGENT_USERNAME,
        copilotAgentEmail: process.env.COPILOT_AGENT_COMMIT_EMAIL,
        issueAuthorId: process.env.ISSUE_AUTHOR_ID
          ? parseInt(process.env.ISSUE_AUTHOR_ID, 10)
          : undefined,
        issueAssigneeUsername: process.env.ISSUE_ASSIGNEE_USERNAME,
        model: process.env.COPILOT_MODEL,
      },
      logger,
    );

    logger.info('✅ Issue workflow completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, '❌ Issue workflow failed');
    process.exit(1);
  } finally {
    await workflowService.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
