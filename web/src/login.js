// Login page (T10). Error texts are generic: they never say more than
// "wrong password" or "wait".
const form = /** @type {HTMLFormElement} */ (document.getElementById('login-form'));
const input = /** @type {HTMLInputElement} */ (document.getElementById('password'));
const error = /** @type {HTMLElement} */ (document.getElementById('login-error'));
const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  button.disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    if (res.status === 204) {
      location.replace('/');
      return;
    }
    error.textContent = await errorText(res);
  } catch {
    error.textContent = 'Cannot connect to the server. Try again.';
  } finally {
    button.disabled = false;
  }
  input.select();
});

/** @param {Response} res */
async function errorText(res) {
  if (res.status === 401) return 'Wrong password.';
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const minutes = Math.max(1, Math.ceil((body.retryAfterSeconds ?? 900) / 60));
    return `Too many failed attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, then try again.`;
  }
  return 'Sign-in failed. Try again.';
}
