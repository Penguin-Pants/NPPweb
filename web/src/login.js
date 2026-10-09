// Login page (T10).
import { api } from './api.js';
import { loginErrorText } from './login-errors.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('login-form'));
const input = /** @type {HTMLInputElement} */ (document.getElementById('password'));
const error = /** @type {HTMLElement} */ (document.getElementById('login-error'));
const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  button.disabled = true;
  const { status, data } = await api.login(input.value);
  if (status === 204) {
    location.replace('/');
    return;
  }
  button.disabled = false;
  error.textContent = loginErrorText(status, data);
  input.select();
});
