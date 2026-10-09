// Public health check for the Railway healthcheck.
/** @param {import('fastify').FastifyInstance} app */
export async function healthRoutes(app) {
  app.get('/healthz', async () => ({ ok: true }));
}
