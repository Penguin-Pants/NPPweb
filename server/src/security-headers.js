// Response headers for every response (BUILD_PLAN.md section 2.9), plus
// Cache-Control: no-store on /api/* (section 2.7).
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // https: for remote Markdown images, which load only after a click (MDV-14, C7).
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * The headers that every response carries.
 * @param {boolean} isProduction
 */
export function securityHeaders(isProduction) {
  return {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(isProduction && { 'Strict-Transport-Security': 'max-age=31536000' }),
  };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ isProduction: boolean }} config
 */
export function addSecurityHeaders(app, { isProduction }) {
  const headers = securityHeaders(isProduction);
  app.addHook('onSend', async (request, reply, payload) => {
    reply.headers(headers);
    // The route pattern catches percent-encoded paths that the router decoded.
    if ([request.url, request.routeOptions.url].some((url) => url?.startsWith('/api/'))) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });
}
