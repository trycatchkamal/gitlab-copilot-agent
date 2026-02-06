#!/usr/bin/env node
import { MrUpdateService } from './lib/mr-update-service.js';
import pino from 'pino';

// Required environment variables
const requiredEnvVars = [
  'GITLAB_TOKEN',
  'TARGET_REPO_URL',
  'TARGET_BRANCH',
  'SOURCE_BRANCH',
  'TARGET_MR_IID',
  'MR_NOTE_INSTRUCTION',
  'TARGET_PROJECT_ID',
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

  const updateService = new MrUpdateService(3);

  try {
    await updateService.start();

    await updateService.processUpdate(
      {
        gitlabToken: process.env.GITLAB_TOKEN!,
        targetRepoUrl: process.env.TARGET_REPO_URL!,
        targetBranch: process.env.TARGET_BRANCH!,
        sourceBranch: process.env.SOURCE_BRANCH!,
        targetMrIid: parseInt(process.env.TARGET_MR_IID!, 10),
        instruction: process.env.MR_NOTE_INSTRUCTION!,
        targetProjectId: parseInt(process.env.TARGET_PROJECT_ID!, 10),
        gitlabBaseUrl: process.env.UPSTREAM_GITLAB_BASE_URL || 'https://gitlab.com',
        ciPipelineUrl: process.env.CI_PIPELINE_URL,
        copilotAgentUsername: process.env.COPILOT_AGENT_USERNAME,
        copilotAgentEmail: process.env.COPILOT_AGENT_COMMIT_EMAIL,
        model: process.env.COPILOT_MODEL,
      },
      logger,
    );

    logger.info('✅ MR update completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, '❌ MR update failed');
    process.exit(1);
  } finally {
    await updateService.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
