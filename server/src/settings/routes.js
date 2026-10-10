// Owner settings (SAV-2, SAV-3, v3 CLR-2 to CLR-4). One value for all
// devices, stored in the settings table: the autosave delay and one color per
// workspace. The client uses the same default delay (web/src/autosave.js)
// until it has read this value.
import { transaction } from '../db.js';
import { WORKSPACES } from '../workspaces.js';

const AUTOSAVE_DEFAULT_SECONDS = 5;
const AUTOSAVE_KEY = 'autosave_seconds';
const colorKey = (workspace) => `color_${workspace}`;

const isValidSeconds = (value) => Number.isInteger(value) && value >= 1 && value <= 60;
// #RGB or #RRGGBB in any letter case (CLR-3).
const isValidColor = (value) => typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

/**
 * A stored value that breaks its rule (for example after a manual edit)
 * reads as the default. A color of null is the workspace's default color.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ autosaveSeconds: number, workspaceColors: Record<string, string | null> }}
 */
function getSettings(db) {
  const read = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
  const stored = Number(read(AUTOSAVE_KEY));
  const workspaceColors = Object.fromEntries(
    WORKSPACES.map((workspace) => {
      const color = read(colorKey(workspace));
      return [workspace, isValidColor(color) ? color : null];
    }),
  );
  return { autosaveSeconds: isValidSeconds(stored) ? stored : AUTOSAVE_DEFAULT_SECONDS, workspaceColors };
}

/**
 * The first rule a PUT body breaks, as an error reply body, or null.
 * workspaceColors is optional. When it is there, it names each workspace once.
 */
function invalidSettings(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { error: 'invalid_request' };
  if (!isValidSeconds(body.autosaveSeconds)) return { error: 'invalid_autosave_seconds' };
  if (!Object.hasOwn(body, 'workspaceColors')) return null;
  const colors = body.workspaceColors;
  const keys = typeof colors === 'object' && colors !== null && !Array.isArray(colors) ? Object.keys(colors) : null;
  if (!keys || keys.length !== WORKSPACES.length || !WORKSPACES.every((workspace) => keys.includes(workspace))) {
    return { error: 'invalid_request' };
  }
  const bad = WORKSPACES.find((workspace) => colors[workspace] !== null && !isValidColor(colors[workspace]));
  return bad ? { error: 'invalid_color', workspace: bad } : null;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync }} options
 */
export async function settingsRoutes(app, { db }) {
  app.get('/api/settings', async () => getSettings(db));

  // Every field is checked before any is saved, so a failed PUT changes
  // nothing (TD-27).
  app.put('/api/settings', async (request, reply) => {
    const { body } = request;
    const error = invalidSettings(body);
    if (error) return reply.code(400).send(error);
    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    );
    transaction(db, () => {
      upsert.run(AUTOSAVE_KEY, String(body.autosaveSeconds));
      if (!Object.hasOwn(body, 'workspaceColors')) return;
      for (const workspace of WORKSPACES) {
        const color = body.workspaceColors[workspace];
        if (color === null) db.prepare('DELETE FROM settings WHERE key = ?').run(colorKey(workspace));
        else upsert.run(colorKey(workspace), color);
      }
    });
    return getSettings(db);
  });
}
