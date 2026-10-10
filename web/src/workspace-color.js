// Text on a workspace color (v3 CLR-5, TD-37): black or white, whichever has
// the higher contrast ratio by the WCAG 2.x relative luminance formula. On
// any sRGB color one of them reaches at least 4.58:1 (C15).

/** @param {string} hex #RGB or #RRGGBB, any letter case */
function luminance(hex) {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4]
    .map((start) => parseInt(full.slice(start, start + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a A hex color.
 * @param {string} b A hex color.
 * @returns {number} From 1 to 21.
 */
export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** @param {string} hex A workspace color. @returns {'#000000' | '#ffffff'} */
export const textColorOn = (hex) =>
  contrastRatio(hex, '#000000') >= contrastRatio(hex, '#ffffff') ? '#000000' : '#ffffff';
