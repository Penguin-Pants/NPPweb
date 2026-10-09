// Sign-in, sign-out and session check (section 2.7).
import { readPasswordHash, verifyPassword } from '../auth/password.js';
import { createLoginLimiter } from '../auth/rate-limit.js';
import {
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookieOptions,
} from '../auth/sessions.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync, config: import('../config.js').Config, clock: () => number }} options
 */
export async function authRoutes(app, { db, config, clock }) {
  const cookieOptions = sessionCookieOptions(config.isProduction);
  const limiter = createLoginLimiter({ clock });

  app.post('/api/login', async (request, reply) => {
    // TD-11: Railway's edge sets X-Real-IP to the client address.
    const ip = request.headers['x-real-ip'] || request.ip;
    const retryAfterSeconds = limiter.retryAfterSeconds(ip);
    if (retryAfterSeconds > 0) {
      reply.header('Retry-After', String(retryAfterSeconds));
      return reply.code(429).send({ error: 'rate_limited', retryAfterSeconds });
    }
    limiter.recordAttempt(ip);
    if (!(await verifyPassword(request.body?.password, readPasswordHash(db)))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    limiter.recordSuccess(ip);
    const token = createSession(db, clock());
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS / 1000 });
    return reply.code(204).send();
  });

  app.post('/api/logout', async (request, reply) => {
    deleteSession(db, request.sessionToken);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return reply.code(204).send();
  });

  app.get('/api/session', async () => ({ authenticated: true }));
}
