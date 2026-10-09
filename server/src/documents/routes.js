// Document API (BUILD_PLAN.md section 2.7). Content travels as text/plain
// with an exact byte limit (TD-7).
import {
  createDocument,
  deleteDocument,
  getDocument,
  LANGUAGES,
  listDocuments,
  normalizeName,
  saveContent,
  updateMeta,
} from './repo.js';

export const CONTENT_LIMIT_BYTES = 1_048_576;

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ db: import('node:sqlite').DatabaseSync, clock: () => number }} options
 */
export async function documentRoutes(app, { db, clock }) {
  app.setErrorHandler((error, request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'too_large', limitBytes: CONTENT_LIMIT_BYTES });
    }
    if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.code(415).send({ error: 'unsupported_media_type' });
    }
    throw error;
  });

  app.get('/api/documents', async () => listDocuments(db));

  app.post('/api/documents', { bodyLimit: CONTENT_LIMIT_BYTES }, async (request, reply) => {
    const content = textBody(request);
    if (content === null) return reply.code(415).send({ error: 'unsupported_media_type' });
    let name;
    if (request.query.name !== undefined) {
      name = normalizeName(request.query.name);
      if (name === null) return reply.code(400).send({ error: 'invalid_name' });
    }
    return reply.code(201).send(createDocument(db, { name, content, now: clock() }));
  });

  app.get('/api/documents/:id', async (request, reply) => {
    const doc = getDocument(db, request.params.id);
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    return doc;
  });

  // TD-6: If-Match carries the version the client last saw.
  app.put('/api/documents/:id/content', { bodyLimit: CONTENT_LIMIT_BYTES }, async (request, reply) => {
    const ifMatch = request.headers['if-match'];
    if (typeof ifMatch !== 'string' || !/^\d+$/.test(ifMatch)) {
      return reply.code(428).send({ error: 'version_required' });
    }
    const content = textBody(request);
    if (content === null) return reply.code(415).send({ error: 'unsupported_media_type' });
    const result = saveContent(db, {
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
      if (body.language !== null && !LANGUAGES.includes(body.language)) {
        return reply.code(400).send({ error: 'invalid_language' });
      }
      changes.language = body.language;
    }
    const meta = updateMeta(db, request.params.id, changes, clock());
    if (!meta) return reply.code(404).send({ error: 'not_found' });
    return meta;
  });

  app.delete('/api/documents/:id', async (request, reply) => {
    if (!deleteDocument(db, request.params.id)) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });
}

/** The text/plain body, '' when there is no body, or null for any other type. */
function textBody(request) {
  if (request.body === undefined) return '';
  return typeof request.body === 'string' ? request.body : null;
}
