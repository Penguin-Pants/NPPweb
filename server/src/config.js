// Reads runtime settings from environment variables (BUILD_PLAN.md section 2.5).
import { resolve } from 'node:path';

/**
 * @typedef {object} Config
 * @property {number} port
 * @property {string} nodeEnv
 * @property {boolean} isProduction
 * @property {string} dataDir Absolute path of the data folder.
 * @property {string | null} ownerPassword
 * @property {boolean} resetPassword
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Config}
 */
export function loadConfig(env) {
  const nodeEnv = env.NODE_ENV || 'development';
  return {
    port: parsePort(env.PORT),
    nodeEnv,
    isProduction: nodeEnv === 'production',
    dataDir: resolve(env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || 'data'),
    ownerPassword: env.OWNER_PASSWORD || null,
    resetPassword: /^(true|1)$/i.test(env.RESET_PASSWORD ?? ''),
  };
}

/** @param {string | undefined} value */
function parsePort(value) {
  if (!value) return 3000;
  const port = Number(value);
  if (!/^\d+$/.test(value) || port > 65535) throw new Error(`Invalid PORT: ${value}`);
  return port;
}
