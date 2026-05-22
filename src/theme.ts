// Design tokens — "dark developer console".

export const ACCENTS = {
  blue: '#5cb6ff',
  cyan: '#3fe0d0',
  green: '#5fe8a4',
  amber: '#ffc24d',
  rose: '#ff7d97',
  violet: '#b69cff',
} as const;

export type AccentKey = keyof typeof ACCENTS;

export const accent = (k?: string): string =>
  (k && (ACCENTS as Record<string, string>)[k]) || ACCENTS.blue;

export const theme = {
  bg: {
    void: '#050607',
    base: '#0a0c10',
    panel: '#10141b',
    panelHi: '#171d27',
    line: '#252d3c',
    lineHi: '#3a4761',
  },
  ink: {
    hi: '#f3f5fa',
    mid: '#a7b0c2',
    low: '#6b7587',
    faint: '#454d5e',
  },
} as const;

// Translucent accent fills, for glows and panel washes.
export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};
