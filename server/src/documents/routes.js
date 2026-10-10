// Document API (BUILD_PLAN.md section 2.7). Content travels as text/plain
// with an exact byte limit (TD-7). Every route acts on the workspace that its
// `workspace` query value names, Personal by default (v3 TD-23).
import { CONTENT_LIMIT_BYTES, LANGUAGE_IDS, WORKSPACES } from '../../../shared/contract.js';
import { parseWorkspace } from '../workspaces.js';
import { createDocument, deleteDocument, getDocument, listDocuments, normalizeName, saveContent, updateMeta } from './repo.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync, clock: () => number }} options
 */
export async function documentRoutes(app, { db, clock }) {
  // Before the body is read, so a bad value never costs a 1 MB upload.
  app.decorateRequest('workspace', null);
  app.addHook('onRequest', async (request, reply) => {
    request.workspace = parseWorkspace(request.query);
    if (request.workspace === null) return reply.code(400).send({ error: 'invalid_workspace' });
  });

  app.get('/api/documents', async (request) => listDocuments(db, request.workspace));

  app.post('/api/documents', { bodyLimit: CONTENT_LIMIT_BYTES }, async (request, reply) => {
    const content = textBody(request, { optional: true });
    if (content === null) return reply.code(415).send({ error: 'unsupported_media_type' });
    let name;
    if (request.query.name !== undefined) {
      name = normalizeName(request.query.name);
      if (name === null) return reply.code(400).send({ error: 'invalid_name' });
    }
    const { language } = request.query;
    if (language !== undefined && !LANGUAGE_IDS.includes(language)) {
      return reply.code(400).send({ error: 'invalid_language' });
    }
    return reply.code(201).send(createDocument(db, { workspace: request.workspace, name, content, language, now: clock() }));
  });

  app.get('/api/documents/:id', async (request, reply) => {
    const doc = getDocument(db, request.workspace, request.params.id);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  // TD-6: If-Match carries the version the client last saw.
  app.put('/api/documents/:id/content', { bodyLimit: CONTENT_LIMIT_BYTES }, async (request, reply) => {
    const ifMatch = request.headers['if-match'];
    if (typeof ifMatch !== 'string' || !/^\d+$/.test(ifMatch)) {
      return reply.code(428).send({ error: 'version_required' });
    }
    const content = textBody(request, { optional: false });
    if (content === null) return reply.code(415).send({ error: 'unsupported_media_type' });
    const result = saveContent(db, {
      workspace: request.workspace,
      id: request.params.id,
      content,
      expectedVersion: Number(ifMatch),
      now: clock(),
    });
    if (result.ok) return { version: result.version, updatedAt: result.updatedAt };
    if (result.currentVersion === null) return reply.code(404).send({ error: 'not_found' });
    return reply.code(412).send({ error: 'version_conflict', currentVersion: result.currentVersion });
  });

  app.patch('/api/documents/:id', async (request, reply) => {
    const { body } = request;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const changes = {};
    if (Object.hasOwn(body, 'name')) {
      changes.name = normalizeName(body.name);
      if (changes.name === null) return reply.code(400).send({ error: 'invalid_name' });
    }
    if (Object.hasOwn(body, 'language')) {
      if (body.language !== null && !LANGUAGE_IDS.includes(body.language)) {
        return reply.code(400).send({ error: 'invalid_language' });
      }
      changes.language = body.language;
    }
    // A move (v3 TD-26): the query names the source, the body the target.
    if (Object.hasOwn(body, 'workspace')) {
      if (!WORKSPACES.includes(body.workspace)) return reply.code(400).send({ error: 'invalid_workspace' });
      changes.workspace = body.workspace;
    }
    const meta = updateMeta(db, request.workspace, request.params.id, changes, clock());
    if (!meta) return reply.code(404).send({ error: 'not_found' });
    return meta;
  });

  app.delete('/api/documents/:id', async (request, reply) => {
    if (!deleteDocument(db, request.workspace, request.params.id)) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}

/**
 * The text/plain UTF-8 body (TD-7), or null for any other type or charset.
 * With `optional`, a request with no body and no Content-Type gives ''.
 * @param {import('fastify').FastifyRequest} request
 * @param {{ optional: boolean }} options
 */
function textBody(request, { optional }) {
  const type = request.headers['content-type'];
  if (type === undefined) return optional && request.body === undefined ? '' : null;
  if (!/^text\/plain\s*(;|$)/i.test(type)) return null;
  const charset = /;\s*charset="?([^";\s]+)/i.exec(type)?.[1];
  if (charset !== undefined && !/^utf-?8$/i.test(charset)) return null;
  return typeof request.body === 'string' ? request.body : '';
}
