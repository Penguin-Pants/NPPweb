import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mermaidConfig, withoutImageUrls, withoutRemoteImages } from '../src/mermaid-render.js';

test('Mermaid runs with securityLevel strict, the dagre layout and the editor theme (MDV-13, C6)', () => {
  assert.deepEqual(mermaidConfig('dark'), { startOnLoad: false, securityLevel: 'strict', layout: 'dagre', theme: 'dark' });
  assert.equal(mermaidConfig('light').theme, 'default');
});

test('image URLs in the source are emptied, data: URLs stay (MDV-14)', () => {
  assert.equal(withoutImageUrls('A@{ img: "https://x.y/a.png", label: "a" }'), 'A@{ img: "", label: "a" }');
  assert.equal(withoutImageUrls("B@{ img: 'pics/b.png' }"), "B@{ img: '' }");
  assert.equal(withoutImageUrls('C@{ IMG : "http://x/c.png" }'), 'C@{ IMG : "" }');
  assert.equal(withoutImageUrls('D@{ img: "data:image/png;base64,AAA" }'), 'D@{ img: "data:image/png;base64,AAA" }');
  assert.equal(withoutImageUrls('graph TD\nA-->B'), 'graph TD\nA-->B');
});

test('image elements with a non-data URL are removed from the SVG (MDV-14)', () => {
  assert.equal(withoutRemoteImages('<svg><image href="https://x/a.png"/><g/></svg>'), '<svg><g/></svg>');
  assert.equal(withoutRemoteImages('<svg><image xlink:href="pics/a.png"></image></svg>'), '<svg></svg>');
  assert.equal(withoutRemoteImages('<div><img src="https://x/a.png" alt="a"></div>'), '<div></div>');
  assert.equal(withoutRemoteImages('<svg><image href="data:image/png;base64,AAA"/></svg>'), '<svg><image href="data:image/png;base64,AAA"/></svg>');
});
