export function hexRgb(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Mix a hex color toward white (target=255) or black (target=0). */
export function mix(hex: string, target: 0 | 255, amount: number): string {
  const [r, g, b] = hexRgb(hex);
  const m = (c: number) => Math.round(c + (target - c) * amount);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
