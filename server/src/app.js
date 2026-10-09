// Builds the Fastify app. The caller owns listen and close.
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { addAuthGate } from './auth/gate.js';
import { documentRoutes } from './documents/routes.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { addSecurityHeaders, securityHeaders } from './security-headers.js';

const defaultWebRoot = fileURLToPath(new URL('../../dist/web', import.meta.url));
const redact = {
  paths: ['headers.cookie', 'headers.authorization', '*.headers.cookie', '*.headers.authorization'],
  censor: '[redacted]',
};

/**
 * @param {object} options
 * @param {import('./config.js').Config} options.config
 * @param {import('node:sqlite').DatabaseSync} options.db
 * @param {() => number} [options.clock] Returns Unix ms. Tests inject it.
 * @param {false | object} [options.logger] `false` turns logging off. An object adds Fastify logger options.
 * @param {string} [options.webRoot] Folder with the built frontend.
 */
export async function buildApp({ config, db, clock = Date.now, logger, webRoot = defaultWebRoot }) {
  const app = Fastify({
    trustProxy: true,
    logger: logger === false ? false : { redact, ...logger },
    // Malformed URLs never reach the router or the onSend hook, so this reply
    // sets the security headers itself.
    frameworkErrors: (error, request, reply) =>
      reply.code(400).headers(securityHeaders(config.isProduction)).send({ error: 'bad_request' }),
  });

  // Every route, including plugin routes, for the gate sweep test.
  const routes = [];
  app.decorate('registeredRoutes', routes);
  app.addHook('onRoute', ({ method, url }) => routes.push({ method, url }));

  // Awaited so its cookie parser runs before the gate hook below.
  await app.register(fastifyCookie);
  addSecurityHeaders(app, config);
  addAuthGate(app, { db, clock });

  app.register(fastifyStatic, { root: webRoot });
  app.get('/login', (request, reply) => reply.sendFile('login.html'));
  app.register(healthRoutes);
  app.register(authRoutes, { db, config, clock });
  app.register(documentRoutes, { db, clock });
  return app;
}
