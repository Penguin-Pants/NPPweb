// Response headers for every response (BUILD_PLAN.md section 2.9), plus
// Cache-Control: no-store on /api/* (section 2.7).
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ isProduction: boolean }} config
 */
export function addSecurityHeaders(app, { isProduction }) {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    if (isProduction) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
}
