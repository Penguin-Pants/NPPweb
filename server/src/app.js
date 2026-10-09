// Builds the Fastify app. The caller owns listen and close.
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

const redact = {
  paths: ['headers.cookie', 'headers.authorization', '*.headers.cookie', '*.headers.authorization'],
  censor: '[redacted]',
};

/**
 * @param {object} options
 * @param {import('./config.js').Config} options.config
 * @param {false | object} [options.logger] `false` turns logging off. An object adds Fastify logger options.
 */
export function buildApp({ config, logger }) {
  const app = Fastify({
    trustProxy: true,
    logger: logger === false ? false : { redact, ...logger },
  });
  app.register(healthRoutes);
  return app;
}
