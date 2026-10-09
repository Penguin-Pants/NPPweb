// Re-login after the session expires (EDGE-4). The editor and its unsaved
// text stay in place behind the dialog.
import { api } from './api.js';
import { formDialog } from './dialogs.js';
import { on } from './events.js';
import { loginErrorText } from './login-errors.js';

/**
 * @param {{ onSignedIn: () => void }} options onSignedIn runs after a successful sign-in.
 */
export function setupSessionRecovery({ onSignedIn }) {
  let open = false;
  on('session-expired', async () => {
    if (open) return;
    open = true;
    await formDialog({
      title: 'Sign in again',
      message: 'Your session ended. Your text is kept in this window. Sign in to save it.',
      fields: [{ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' }],
      submitLabel: 'Sign in',
      cancellable: false,
      onSubmit: async ({ password }) => {
        const { status, data } = await api.login(password);
        return status === 204 ? null : loginErrorText(status, data);
      },
    });
    open = false;
    onSignedIn();
  });
}
