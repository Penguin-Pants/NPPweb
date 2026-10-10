// Native <dialog> helpers. All text goes in through textContent, so document
// names can never inject markup.

let nextId = 0;

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {string} [text]
 */
function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function createDialog(title, message) {
  const id = `dialog-${(nextId += 1)}`;
  const dialog = el('dialog', { 'aria-labelledby': `${id}-title` });
  dialog.append(el('h2', { id: `${id}-title` }, title));
  if (message) dialog.append(el('p', { class: 'dialog-message' }, message));
  document.body.append(dialog);
  return { dialog, id };
}

/**
 * Wires Escape and closing for a modal. A browser can close a modal even when
 * its cancel event is prevented (for example on a second Escape press), so a
 * dialog that must not be dismissed opens again, and a cancellable one
 * counts the close as cancel.
 * @param {HTMLDialogElement} dialog
 * @param {boolean} cancellable
 * @param {() => void} onCancel
 * @returns {() => void} Call before closing the dialog on purpose.
 */
function guardClose(dialog, cancellable, onCancel) {
  let done = false;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (cancellable) onCancel();
  });
  dialog.addEventListener('close', () => {
    if (done) return;
    if (cancellable) onCancel();
    else dialog.showModal();
  });
  return () => {
    done = true;
  };
}

/**
 * Shows a modal with one button per choice. Resolves with the chosen value,
 * or cancelValue when the user presses Escape.
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {{ value: string, label: string, kind?: 'primary' | 'danger' }[]} options.choices
 * @param {string} options.defaultValue The choice that gets focus.
 * @param {string} [options.cancelValue] Result for Escape. Without it, the user must choose.
 * @param {(value: string) => Promise<string | null>} [options.onChoose] Runs the choice while the
 *   dialog stays open (buttons disabled, so nothing can be typed meanwhile). An error text keeps the
 *   dialog open with the text shown. null closes it.
 * @returns {Promise<string>}
 */
export function choose({ title, message, choices, defaultValue, cancelValue, onChoose }) {
  const { dialog } = createDialog(title, message);
  const error = el('p', { class: 'form-error', role: 'alert' });
  const row = el('div', { class: 'dialog-buttons' });
  dialog.append(...(onChoose ? [error] : []), row);
  return new Promise((resolve) => {
    const finish = (value) => {
      markDone();
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const markDone = guardClose(dialog, cancelValue !== undefined, () => finish(cancelValue));
    const buttons = choices.map((choice) => {
      const button = el('button', { type: 'button', 'data-value': choice.value }, choice.label);
      if (choice.kind) button.classList.add(choice.kind);
      button.addEventListener('click', async () => {
        if (!onChoose) {
          finish(choice.value);
          return;
        }
        for (const other of buttons) other.disabled = true;
        error.textContent = '';
        const problem = await onChoose(choice.value);
        if (problem === null) {
          finish(choice.value);
          return;
        }
        for (const other of buttons) other.disabled = false;
        error.textContent = problem;
        button.focus();
      });
      return button;
    });
    row.append(...buttons);
    dialog.showModal();
    /** @type {HTMLButtonElement} */ (row.querySelector(`[data-value="${defaultValue}"]`)).focus();
  });
}

/**
 * Shows a modal form. onSubmit returns an error text to keep the dialog open,
 * or null to close it. Resolves with the field values, or null on cancel.
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {{ name: string, label: string, type?: string, value?: string, autocomplete?: string }[]} options.fields
 * @param {string} options.submitLabel
 * @param {boolean} [options.cancellable] false hides Cancel and ignores Escape.
 * @param {(values: Record<string, string>) => Promise<string | null>} options.onSubmit
 * @returns {Promise<Record<string, string> | null>}
 */
export function formDialog({ title, message, fields, submitLabel, cancellable = true, onSubmit }) {
  const { dialog, id } = createDialog(title, message);
  const form = el('form', { class: 'dialog-form', novalidate: '' });
  const inputs = fields.map((field, index) => {
    const inputId = `${id}-field-${index}`;
    const input = el('input', {
      id: inputId,
      name: field.name,
      type: field.type ?? 'text',
      autocomplete: field.autocomplete ?? 'off',
    });
    input.value = field.value ?? '';
    form.append(el('label', { for: inputId }, field.label), input);
    return input;
  });
  const error = el('p', { class: 'form-error', role: 'alert' });
  const row = el('div', { class: 'dialog-buttons' });
  const submit = el('button', { type: 'submit', class: 'primary' }, submitLabel);
  row.append(submit);
  form.append(error, row);
  dialog.append(form);

  return new Promise((resolve) => {
    const finish = (values) => {
      markDone();
      dialog.close();
      dialog.remove();
      resolve(values);
    };
    // While a submit runs, its result decides. A cancel then would close the
    // dialog while the change still happens.
    let busy = false;
    const cancel = () => {
      if (!busy) finish(null);
      else if (!dialog.open) dialog.showModal();
    };
    const markDone = guardClose(dialog, cancellable, cancel);
    const cancelButton = cancellable ? el('button', { type: 'button' }, 'Cancel') : null;
    if (cancelButton) {
      cancelButton.addEventListener('click', cancel);
      row.append(cancelButton);
    }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const values = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
      busy = true;
      submit.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      error.textContent = '';
      const problem = await onSubmit(values);
      busy = false;
      submit.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      if (problem === null) finish(values);
      else error.textContent = problem;
    });
    dialog.showModal();
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}
