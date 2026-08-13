export const NOTE_COLORS: { light: string; dark: string }[] = [
  { light: '#FFF59D', dark: '#8D6E00' },
  { light: '#FFCCBC', dark: '#AD1457' },
  { light: '#C8E6C9', dark: '#2E7D32' },
  { light: '#B3E5FC', dark: '#0277BD' },
  { light: '#E1BEE7', dark: '#6A1B9A' },
];

// Fallback for a color not present in NOTE_COLORS: a fixed neutral dark, not the input color
// itself. Callers pair this with `backgroundColor: color`, so echoing the (light) input back
// as the text color would render invisible background-on-background text; a neutral dark
// keeps the text readable instead.
const FALLBACK_DARK_COLOR = '#333333';

export function getDarkColor(light: string): string {
  return NOTE_COLORS.find((c) => c.light === light)?.dark ?? FALLBACK_DARK_COLOR;
}
