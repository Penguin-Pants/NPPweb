// Entry point. Startup order follows BUILD_PLAN.md section 2.10.
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/**
 * Starts the server. Returns the app, or undefined after a startup failure.
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(code: number) => void} [options.exit]
 * @param {false | object} [options.logger]
 */
export async function start({ env = process.env, exit = process.exit, logger } = {}) {
  let config;
  try {
    config = loadConfig(env);
  } catch (err) {
    console.error(err.message);
    exit(1);
    return undefined;
  }

  const app = buildApp({ config, logger });
  await app.listen({ host: '0.0.0.0', port: config.port });

  const shutdown = async () => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    await app.close();
    exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return app;
}

if (import.meta.main) await start();
