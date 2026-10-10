// Runs inside the hidden diagram frame that mermaid-render.js adds. The
// frame's CSP allows only data: images and no stylesheets, fonts or
// connections, so a diagram can load nothing while Mermaid draws and
// measures it (MDV-14). Mermaid writes into this frame, never into the page.
import mermaid from 'mermaid';

const box = document.createElement('div');
document.body.append(box);
let nextId = 0;

/**
 * Draws a diagram. Resolves with the SVG as XML, so it works as an image,
 * and its size, or with { error } (EDGE-15).
 * @param {string} source
 * @param {object} config From mermaidConfig.
 */
window.drawDiagram = async (source, config) => {
  nextId += 1;
  try {
    mermaid.initialize(config);
    const { svg } = await mermaid.render(`diagram-${nextId}`, source, box);
    box.innerHTML = svg;
    const element = box.querySelector('svg');
    const size = element.viewBox?.baseVal;
    return { svg: new XMLSerializer().serializeToString(element), width: size?.width ?? 0, height: size?.height ?? 0 };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  } finally {
    box.replaceChildren();
  }
};
