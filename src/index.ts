import 'dotenv/config';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { gitlabEventsHandler } from './gitlab-events-handler.js';

async function main() {
  // Load and validate configuration
  const config = loadConfig();

  // Create Fastify instance with logging
  const fastify = Fastify({
    logger: {
      level: config.LOG_DEBUG ? 'debug' : 'info',
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Webhook endpoint
  fastify.post('/gitlab-events', async (request, reply) => {
    return gitlabEventsHandler(request, reply, config);
  });

  // Start server
  try {
    await fastify.listen({
      host: config.LISTEN_HOST,
      port: config.LISTEN_PORT,
    });

    fastify.log.info(
      {
        host: config.LISTEN_HOST,
        port: config.LISTEN_PORT,
        env: config.NODE_ENV,
      },
      'Server started successfully',
    );
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      fastify.log.info(`Received ${signal}, shutting down gracefully`);
      await fastify.close();
      process.exit(0);
    });
  }
}

main();
