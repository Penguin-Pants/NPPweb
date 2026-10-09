// Find and replace on the current tab (EDT-5, TD-9, T21). Literal text only,
// case-insensitive (INT-8). No regex, whole-word or case controls, and no
// default searchKeymap. The search state lives in each tab's EditorState.
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from '@codemirror/search';

const literalQuery = (text, replacement) =>
  new SearchQuery({ search: text, replace: replacement, literal: true, regexp: false, wholeWord: false, caseSensitive: false });

function button(label, title, onClick) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.title = title;
  node.addEventListener('click', onClick);
  return node;
}

function textInput(label, className) {
  const node = document.createElement('input');
  node.type = 'text';
  node.className = className;
  node.setAttribute('aria-label', label);
  node.placeholder = label;
  node.spellcheck = false;
  return node;
}

/** @param {import('@codemirror/view').EditorView} view */
function createPanel(view) {
  const dom = document.createElement('div');
  dom.className = 'search-panel';
  dom.setAttribute('role', 'search');
  const find = textInput('Find', 'search-find');
  // openSearchPanel focuses the element with this attribute.
  find.setAttribute('main-field', 'true');
  const replace = textInput('Replace with', 'search-replace');
  const query = getSearchQuery(view.state);
  find.value = query.search;
  replace.value = query.replace;

  const commit = () => {
    const next = literalQuery(find.value, replace.value);
    if (!next.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(next) });
  };
  const run = (command) => () => {
    commit();
    command(view);
  };
  const close = () => {
    closeSearchPanel(view);
    view.focus();
  };

  find.addEventListener('input', commit);
  replace.addEventListener('input', commit);
  dom.addEventListener('keydown', (event) => {
    // Enter belongs to the fields. On a focused button it clicks that button.
    if (event.key === 'Enter' && (event.target === find || event.target === replace) && !event.isComposing) {
      event.preventDefault();
      run(event.shiftKey ? findPrevious : findNext)();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  dom.append(
    find,
    replace,
    button('Previous', 'Previous match (Shift+Enter)', run(findPrevious)),
    button('Next', 'Next match (Enter)', run(findNext)),
    button('Replace', 'Replace this match', run(replaceNext)),
    button('Replace all', 'Replace every match in this document', run(replaceAll)),
    button('Close', 'Close (Escape)', close),
  );

  return {
    dom,
    top: true,
    mount() {
      find.focus();
      find.select();
    },
    /** Keeps the inputs in step when the query changes from outside. */
    update(update) {
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setSearchQuery) && !effect.value.eq(literalQuery(find.value, replace.value))) {
            find.value = effect.value.search;
            replace.value = effect.value.replace;
          }
        }
      }
    },
  };
}

/** The search extension for each tab's state. */
export const searchExtension = () =>
  search({ top: true, literal: true, regexp: false, wholeWord: false, caseSensitive: false, createPanel });

/** @param {import('@codemirror/view').EditorView} view @param {string} selector */
function openAndFocus(view, selector) {
  // With a selection, openSearchPanel builds a query from it with no replace
  // text, which would clear the replace field. Keep what the user typed.
  const { replace } = getSearchQuery(view.state);
  openSearchPanel(view);
  const query = getSearchQuery(view.state);
  if (replace && !query.replace) {
    view.dispatch({ effects: setSearchQuery.of(literalQuery(query.search, replace)) });
  }
  const input = /** @type {HTMLInputElement | null} */ (view.dom.querySelector(`.search-panel ${selector}`));
  input?.focus();
  input?.select();
}

/** Opens the panel with the find field focused. */
export const openFind = (view) => openAndFocus(view, '.search-find');

/** Opens the panel with the replace field focused. */
export const openReplace = (view) => openAndFocus(view, '.search-replace');
