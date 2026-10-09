// Auth gate (T07): one onRequest hook on the root app, so it also covers
// static files and unknown paths. Order: Origin check, public allowlist, session.
import { isValidSession, SESSION_COOKIE } from './sessions.js';

// "METHOD path" pairs that answer without a session (BUILD_PLAN.md section 2.9).
const PUBLIC = new Set([
  'GET /login',
  'GET /login.js',
  'GET /theme-init.js',
  'GET /styles.css',
  'GET /healthz',
  'POST /api/login',
]);
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync, clock: () => number }} options
 */
export function addAuthGate(app, { db, clock }) {
  app.decorateRequest('sessionToken', null);
  app.addHook('onRequest', async (request, reply) => {
    if (STATE_CHANGING.has(request.method) && !isSameOrigin(request)) {
      return reply.code(403).send({ error: 'bad_origin' });
    }
    const method = request.method === 'HEAD' ? 'GET' : request.method;
    const path = request.url.split('?', 1)[0];
    if (PUBLIC.has(`${method} ${path}`)) return;

    const token = request.cookies[SESSION_COOKIE];
    if (token && isValidSession(db, token, clock())) {
      request.sessionToken = token;
      return;
    }
    if (method === 'GET' && request.headers.accept?.includes('text/html')) {
      return reply.redirect('/login');
    }
    return reply.code(401).send({ error: 'unauthorized' });
  });
}

// TD-12: the Origin host must equal the Host header. Default ports are
// normalized by parsing both with the Origin's scheme.
function isSameOrigin(request) {
  const { origin } = request.headers;
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.host === new URL(`${url.protocol}//${request.host}`).host;
  } catch {
    return false;
  }
}
