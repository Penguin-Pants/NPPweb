import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contrastRatio, textColorOn } from '../src/workspace-color.js';

test('text on a workspace color is black or white, and reaches 4.5:1 (CLR-5)', () => {
  for (const [color, text] of [
    ['#777777', '#000000'],
    ['#ffff00', '#000000'],
    ['#000080', '#ffffff'],
    ['#0f766e', '#ffffff'],
  ]) {
    assert.equal(textColorOn(color), text, color);
    assert.ok(contrastRatio(color, text) >= 4.5, `${color}: ${contrastRatio(color, text)}`);
  }
});

test('#RGB works like #RRGGBB, in any letter case', () => {
  assert.equal(textColorOn('#FFF'), '#000000');
  assert.equal(textColorOn('#000'), '#ffffff');
  assert.equal(contrastRatio('#AbC', '#000'), contrastRatio('#aabbcc', '#000000'));
});

test('contrast ratios follow the WCAG formula', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} is not ${expected}`);
  near(contrastRatio('#000000', '#ffffff'), 21);
  near(contrastRatio('#ffffff', '#000000'), 21);
  near(contrastRatio('#777777', '#000000'), 4.69);
  near(contrastRatio('#ffff00', '#000000'), 19.56);
  near(contrastRatio('#000080', '#ffffff'), 16.01);
  near(contrastRatio('#0f766e', '#ffffff'), 5.47);
});
