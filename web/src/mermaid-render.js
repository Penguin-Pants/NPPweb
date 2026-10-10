// Mermaid diagrams (MDV-12, MDV-13). Mermaid loads on first use, in its own
// chunks, and runs with securityLevel 'strict'. Remote images never load
// (MDV-14): image URLs in the source are emptied before rendering, and image
// elements with a non-data URL are removed from the result.

/** @type {Promise<any> | null} */
let loading = null;
const loadMermaid = () => (loading ??= import('mermaid').then((module) => module.default));

/**
 * The Mermaid settings for a theme. Mermaid 12 lays out with ELK by default,
 * which is not shipped (C6), so dagre is set.
 */
export const mermaidConfig = (theme) => ({
  startOnLoad: false,
  securityLevel: 'strict',
  layout: 'dagre',
  theme: theme === 'dark' ? 'dark' : 'default',
});

/** The source with every image URL emptied, except data: URLs. */
export const withoutImageUrls = (source) =>
  source.replace(/\b(img\s*:\s*)(["'])(?!data:)[^"']*\2/gi, '$1$2$2');

/** The SVG without <image> or <img> elements that point anywhere but data:. */
export const withoutRemoteImages = (svg) =>
  svg.replace(/<(image|img)\b(?![^>]*\b(?:xlink:)?(?:href|src)\s*=\s*["']data:)[^>]*>(?:\s*<\/\1>)?/gi, '');

// Mermaid has one global configuration, so renders run one at a time.
let queue = Promise.resolve();
/** @type {Map<string, Promise<{ svg?: string, error?: string }>>} */
const results = new Map();
let nextId = 0;

/**
 * Renders a diagram once per source and theme. Resolves with { svg } or
 * { error } (EDGE-15).
 * @param {string} source
 * @param {'dark' | 'light'} theme
 */
export function renderMermaid(source, theme) {
  const key = `${theme}\n${source}`;
  if (!results.has(key)) {
    const result = queue.then(async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize(mermaidConfig(theme));
        nextId += 1;
        const { svg } = await mermaid.render(`pn-mermaid-${nextId}`, withoutImageUrls(source));
        return { svg: withoutRemoteImages(svg) };
      } catch (err) {
        return { error: String(err?.message ?? err) };
      }
    });
    queue = result.then(() => undefined);
    results.set(key, result);
  }
  return results.get(key);
}
