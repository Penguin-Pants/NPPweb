// Owner settings (SAV-2, SAV-3). One value for all devices, stored in the
// settings table. Today it holds only the autosave delay.
export const AUTOSAVE_DEFAULT_SECONDS = 5;
const AUTOSAVE_KEY = 'autosave_seconds';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ autosaveSeconds: number }}
 */
export function getSettings(db) {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(AUTOSAVE_KEY)?.value;
  return { autosaveSeconds: stored === undefined ? AUTOSAVE_DEFAULT_SECONDS : Number(stored) };
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync }} options
 */
export async function settingsRoutes(app, { db }) {
  app.get('/api/settings', async () => getSettings(db));

  app.put('/api/settings', async (request, reply) => {
    const { body } = request;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const seconds = body.autosaveSeconds;
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
      return reply.code(400).send({ error: 'invalid_autosave_seconds' });
    }
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    ).run(AUTOSAVE_KEY, String(seconds));
    return getSettings(db);
  });
}
