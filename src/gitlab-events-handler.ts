import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from './config.js';
import { webhookPayloadSchema } from './types.js';
import { persistPayload, sanitizeHeaders } from './utils.js';
import {
  extractIssueVariables,
  extractMrNoteVariables,
  extractMrReviewerVariables,
} from './extractors.js';
import { triggerPipeline } from './pipeline.js';

/**
 * Validate webhook secret token
 */
function validateWebhookToken(request: FastifyRequest, config: Config): boolean {
  if (!config.WEBHOOK_SECRET_TOKEN) {
    return true; // No token configured, skip validation
  }

  const headerToken = request.headers['x-gitlab-token'];
  if (headerToken !== config.WEBHOOK_SECRET_TOKEN) {
    request.log.warn('Invalid webhook token received');
    return false;
  }

  return true;
}

/**
 * Webhook handler
 */
export async function gitlabEventsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  config: Config,
) {
  // Validate webhook token
  if (!validateWebhookToken(request, config)) {
    return reply.code(401).send({
      status: 'ignored',
      reason: 'Invalid webhook token',
    });
  }

  // Log sanitized headers
  request.log.debug({ headers: sanitizeHeaders(request.headers) }, 'Incoming webhook');

  // Check event type
  const eventName = request.headers['x-gitlab-event'];
  const supportedEvents = ['Issue Hook', 'Note Hook', 'Merge Request Hook'];

  if (!supportedEvents.includes(eventName as string)) {
    request.log.debug({ eventName }, 'Ignoring unsupported event type');
    return reply.code(202).send({
      status: 'ignored',
      reason: 'Unsupported event type',
    });
  }

  // Parse and validate payload
  const parseResult = webhookPayloadSchema.safeParse(request.body);

  if (!parseResult.success) {
    request.log.warn({ error: parseResult.error }, 'Invalid webhook payload');
    return reply.code(400).send({
      status: 'error',
      reason: 'Invalid webhook payload',
      details: parseResult.error.format(),
    });
  }

  const payload = parseResult.data;

  // Persist payload for audit
  await persistPayload(payload, request.log);

  // Extract variables based on event type
  let variables;
  try {
    if (payload.object_kind === 'issue') {
      request.log.info('Processing issue event');
      variables = extractIssueVariables(payload, config);
    } else if (payload.object_kind === 'note') {
      request.log.info('Processing MR note event');
      variables = extractMrNoteVariables(payload, config);
    } else if (payload.object_kind === 'merge_request') {
      request.log.info('Processing MR reviewer event');
      variables = extractMrReviewerVariables(payload, config);
    } else {
      // This should never happen due to discriminated union
      return reply.code(202).send({
        status: 'ignored',
        reason: 'Unsupported object kind',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    request.log.info({ error: message }, 'Skipping event');
    return reply.code(202).send({
      status: 'ignored',
      reason: message,
    });
  }

  // Trigger pipeline
  try {
    const pipelineResponse = await triggerPipeline(variables, config, request.log);

    return reply.code(200).send({
      status: 'queued',
      pipeline_id: pipelineResponse.id,
      web_url: pipelineResponse.web_url,
      ref: pipelineResponse.ref,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    request.log.error({ error }, 'Pipeline trigger failed');
    return reply.code(502).send({
      status: 'error',
      reason: message,
    });
  }
}
