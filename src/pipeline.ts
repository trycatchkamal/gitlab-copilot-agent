import { request } from 'undici';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config.js';
import type { PipelineVariables } from './types.js';

interface PipelineResponse {
  id: number;
  web_url: string;
  ref: string;
}

/**
 * Trigger GitLab CI/CD pipeline with variables
 */
export async function triggerPipeline(
  variables: PipelineVariables,
  config: Config,
  logger: FastifyBaseLogger,
): Promise<PipelineResponse> {
  const triggerUrl = `${config.GITLAB_API_BASE}/api/v4/projects/${config.PIPELINE_PROJECT_ID}/trigger/pipeline`;

  // Build form data
  const formData = new URLSearchParams();
  formData.append('token', config.PIPELINE_TRIGGER_TOKEN);
  formData.append('ref', config.PIPELINE_REF);

  for (const [key, value] of Object.entries(variables)) {
    formData.append(`variables[${key}]`, value);
  }

  logger.info(
    {
      projectId: config.PIPELINE_PROJECT_ID,
      ref: config.PIPELINE_REF,
      triggerType: variables.TRIGGER_TYPE,
      variableKeys: Object.keys(variables),
    },
    'Triggering pipeline',
  );

  try {
    const response = await request(triggerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (response.statusCode >= 300) {
      const errorBody = await response.body.text();
      logger.error({ statusCode: response.statusCode, body: errorBody }, 'Pipeline trigger failed');
      throw new Error(`Pipeline trigger failed: ${errorBody}`);
    }

    const body = (await response.body.json()) as PipelineResponse;

    logger.info(
      {
        pipelineId: body.id,
        webUrl: body.web_url,
      },
      'Pipeline triggered successfully',
    );

    return body;
  } catch (error) {
    logger.error({ error }, 'Failed to trigger pipeline');
    throw error;
  }
}
