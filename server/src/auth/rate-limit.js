// In-memory login rate limiter (TD-10). Two fixed windows that start at the
// first counted attempt: one per client IP and one global.
// Each attempt counts before the password check, so parallel guesses cannot
// pass the limit. A success clears that IP and refunds its global count.

/**
 * @param {object} options
 * @param {() => number} options.clock Returns Unix ms.
 * @param {number} [options.perIpLimit]
 * @param {number} [options.globalLimit]
 * @param {number} [options.windowMs]
 */
export function createLoginLimiter({ clock, perIpLimit = 5, globalLimit = 30, windowMs = 15 * 60 * 1000 }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const perIp = new Map();
  let total = { count: 0, resetAt: 0 };

  const isLive = (bucket, now) => bucket !== undefined && now < bucket.resetAt;
  const bump = (bucket, now) => (isLive(bucket, now) ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + windowMs });
  const wait = (bucket, limit, now) =>
    isLive(bucket, now) && bucket.count >= limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;

  return {
    /** Seconds until ip may try again. 0 means allowed. */
    retryAfterSeconds(ip) {
      const now = clock();
      return Math.max(wait(perIp.get(ip), perIpLimit, now), wait(total, globalLimit, now));
    },

    /** Counts one attempt for ip. Call it before the password check. */
    recordAttempt(ip) {
      const now = clock();
      for (const [key, bucket] of perIp) if (!isLive(bucket, now)) perIp.delete(key);
      perIp.set(ip, bump(perIp.get(ip), now));
      total = bump(total, now);
    },

    /** Clears ip after a correct password. */
    recordSuccess(ip) {
      perIp.delete(ip);
      if (isLive(total, clock())) total = { ...total, count: Math.max(0, total.count - 1) };
    },
  };
}
