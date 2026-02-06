#!/usr/bin/env node

/**
 * CLI tool for performing MR code reviews using Copilot SDK
 * This replaces the scripts/mr_review.sh shell script
 */

import { MrReviewService } from './lib/mr-review-service.js';
import pino from 'pino';

// Required environment variables
const requiredEnvVars = [
  'GITLAB_TOKEN',
  'TARGET_REPO_URL',
  'TARGET_BRANCH',
  'SOURCE_BRANCH',
  'TARGET_MR_IID',
  'MR_TITLE',
  'MR_DESCRIPTION',
  'TARGET_PROJECT_ID',
] as const;

/**
 * Validate required environment variables
 */
function validateEnv(): void {
  const missing: string[] = [];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error('[ERROR] Missing required environment variables:');
    for (const varName of missing) {
      console.error(`  - ${varName}`);
    }
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main() {
  // Validate environment
  validateEnv();

  // Setup logger
  const logger = pino({
    level: process.env.LOG_DEBUG === 'true' ? 'debug' : 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  });

  // Create review service
  const reviewService = new MrReviewService(3); // Max 3 concurrent reviews

  try {
    logger.info('Starting Copilot client...');
    await reviewService.start();

    logger.info('Processing MR code review request...');
    logger.info(`MR Title: ${process.env.MR_TITLE}`);
    logger.info(`MR IID: ${process.env.TARGET_MR_IID}`);

    // Perform review
    await reviewService.reviewMergeRequest(
      {
        gitlabToken: process.env.GITLAB_TOKEN!,
        targetRepoUrl: process.env.TARGET_REPO_URL!,
        targetBranch: process.env.TARGET_BRANCH!,
        sourceBranch: process.env.SOURCE_BRANCH!,
        targetMrIid: parseInt(process.env.TARGET_MR_IID!, 10),
        mrTitle: process.env.MR_TITLE!,
        mrDescription: process.env.MR_DESCRIPTION || '',
        targetProjectId: parseInt(process.env.TARGET_PROJECT_ID!, 10),
        gitlabBaseUrl: process.env.UPSTREAM_GITLAB_BASE_URL || 'https://gitlab.com',
        ciPipelineUrl: process.env.CI_PIPELINE_URL,
        language: process.env.COPILOT_LANGUAGE || 'en',
        enableInlineComments: process.env.ENABLE_INLINE_REVIEW_COMMENTS === 'true',
        model: process.env.COPILOT_MODEL,
      },
      logger,
    );

    logger.info('✅ MR code review completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, '❌ MR code review failed');
    process.exit(1);
  } finally {
    try {
      await reviewService.stop();
    } catch (error) {
      logger.warn({ error }, 'Error stopping review service');
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[INFO] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[INFO] Shutting down gracefully...');
  process.exit(0);
});

// Run
main().catch((error) => {
  console.error('[FATAL]', error);
  process.exit(1);
});
