// Error texts for a failed sign-in, shared by the login page and the
// re-login dialog. They are generic: never more than "wrong password" or "wait".

/**
 * @param {number} status HTTP status, or 0 for a network failure.
 * @param {{ retryAfterSeconds?: number } | null} data
 */
export function loginErrorText(status, data) {
  if (status === 401) return 'Wrong password.';
  if (status === 429) {
    const minutes = Math.max(1, Math.ceil((data?.retryAfterSeconds ?? 900) / 60));
    return `Too many failed attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, then try again.`;
  }
  if (status === 0) return 'Cannot connect to the server. Try again.';
  return 'Sign-in failed. Try again.';
}
