import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createLoginLimiter } from '../src/auth/rate-limit.js';
import { createTestApp, ORIGIN, PASSWORD } from './helpers.js';

const WINDOW_MS = 15 * 60 * 1000;

describe('createLoginLimiter', () => {
  let now;
  let limiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = createLoginLimiter({ clock: () => now });
  });

  const fail = (ip, times) => {
    for (let i = 0; i < times; i += 1) limiter.recordAttempt(ip);
  };

  test('allows 5 failures per IP, then blocks until the window ends', () => {
    fail('a', 4);
    assert.equal(limiter.retryAfterSeconds('a'), 0);
    fail('a', 1);
    assert.equal(limiter.retryAfterSeconds('a'), 900);
    now += WINDOW_MS - 1000;
    assert.equal(limiter.retryAfterSeconds('a'), 1);
    now += 1000;
    assert.equal(limiter.retryAfterSeconds('a'), 0);
  });

  test('the window starts at the first failure', () => {
    fail('a', 1);
    now += 10 * 60 * 1000;
    fail('a', 4);
    assert.equal(limiter.retryAfterSeconds('a'), 300);
  });

  test('other IPs are not blocked by one IP', () => {
    fail('a', 5);
    assert.equal(limiter.retryAfterSeconds('b'), 0);
  });

  test('30 failures in total block every IP', () => {
    for (let i = 0; i < 6; i += 1) fail(`ip-${i}`, 5);
    assert.equal(limiter.retryAfterSeconds('fresh'), 900);
    now += WINDOW_MS;
    assert.equal(limiter.retryAfterSeconds('fresh'), 0);
  });

  test('29 failures in total do not block a fresh IP', () => {
    for (let i = 0; i < 5; i += 1) fail(`ip-${i}`, 5);
    fail('ip-5', 4);
    assert.equal(limiter.retryAfterSeconds('fresh'), 0);
  });

  test('a success refunds its attempt from the global count', () => {
    for (let i = 0; i < 5; i += 1) fail(`ip-${i}`, 5);
    fail('ip-5', 4);
    fail('winner', 1);
    limiter.recordSuccess('winner');
    assert.equal(limiter.retryAfterSeconds('fresh'), 0);
  });

  test('a success clears only that IP', () => {
    fail('a', 4);
    fail('b', 4);
    limiter.recordSuccess('a');
    fail('a', 4);
    assert.equal(limiter.retryAfterSeconds('a'), 0);
    fail('b', 1);
    assert.ok(limiter.retryAfterSeconds('b') > 0);
  });
});

describe('POST /api/login rate limit', () => {
  let ctx;
  let now;

  beforeEach(async () => {
    now = Date.UTC(2026, 0, 1);
    ctx = await createTestApp({ clock: () => now });
  });

  afterEach(() => ctx.close());

  const attempt = (ip, password) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { origin: ORIGIN, ...(ip && { 'x-real-ip': ip }) },
      payload: { password },
    });

  test('the 6th attempt from one IP gets 429 even with the right password', async () => {
    for (let i = 0; i < 5; i += 1) assert.equal((await attempt('1.1.1.1', 'wrong-password')).statusCode, 401);
    const res = await attempt('1.1.1.1', PASSWORD);
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['retry-after'], '900');
    assert.deepEqual(res.json(), { error: 'rate_limited', retryAfterSeconds: 900 });
    assert.equal(res.headers['set-cookie'], undefined);
  });

  test('the block ends after 15 minutes', async () => {
    for (let i = 0; i < 5; i += 1) await attempt('1.1.1.1', 'wrong-password');
    now += WINDOW_MS;
    assert.equal((await attempt('1.1.1.1', PASSWORD)).statusCode, 204);
  });

  test('blocked attempts do not extend the block', async () => {
    for (let i = 0; i < 5; i += 1) await attempt('1.1.1.1', 'wrong-password');
    now += WINDOW_MS - 1000;
    assert.equal((await attempt('1.1.1.1', 'wrong-password')).statusCode, 429);
    now += 1000;
    assert.equal((await attempt('1.1.1.1', PASSWORD)).statusCode, 204);
  });

  test('other IPs work until the global limit of 30', async () => {
    for (let i = 0; i < 5; i += 1) await attempt('1.1.1.1', 'wrong-password');
    assert.equal((await attempt('2.2.2.2', PASSWORD)).statusCode, 204);
    for (let ip = 3; ip <= 7; ip += 1) {
      for (let i = 0; i < 5; i += 1) assert.equal((await attempt(`${ip}.0.0.1`, 'wrong-password')).statusCode, 401);
    }
    assert.equal((await attempt('9.9.9.9', PASSWORD)).statusCode, 429);
  });

  test('a success clears that IP count', async () => {
    for (let i = 0; i < 4; i += 1) await attempt('1.1.1.1', 'wrong-password');
    assert.equal((await attempt('1.1.1.1', PASSWORD)).statusCode, 204);
    for (let i = 0; i < 4; i += 1) assert.equal((await attempt('1.1.1.1', 'wrong-password')).statusCode, 401);
    assert.equal((await attempt('1.1.1.1', PASSWORD)).statusCode, 204);
  });

  test('parallel attempts cannot pass the per-IP limit', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => attempt('1.1.1.1', 'wrong-password')));
    const codes = results.map((res) => res.statusCode);
    assert.equal(codes.filter((code) => code === 401).length, 5);
    assert.equal(codes.filter((code) => code === 429).length, 7);
  });

  test('without X-Real-IP the socket address is the key', async () => {
    for (let i = 0; i < 5; i += 1) await attempt(undefined, 'wrong-password');
    assert.equal((await attempt(undefined, PASSWORD)).statusCode, 429);
    assert.equal((await attempt('1.1.1.1', PASSWORD)).statusCode, 204);
  });
});
