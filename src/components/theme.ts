import type { TextStyle } from 'react-native';

/**
 * Oliv design system — "Grove". See docs/DESIGN_SYSTEM.md.
 * Strava data-confidence + Beli warmth, in an olive-grove palette.
 */

/* ------------------------------- color ------------------------------- */

export const colors = {
  // neutrals
  ink: '#1A1C17',
  ink70: '#44483D',
  ink50: '#6E7268',
  ink30: '#A2A698',
  paper: '#FBFAF6',
  surface: '#FFFFFF',
  line: '#ECEAE0',
  fill: '#F1F0E8',

  // brand
  olive: '#54732B',
  oliveDeep: '#2C3B18',
  oliveSoft: '#E7EDD8',
  ember: '#E0683C',
  emberSoft: '#F8E4DA',

  // score ramp anchors (see scoreColor)
  scorePoor: '#C2553D',
  scoreMid: '#C29A2A',
  scoreGood: '#54732B',

  // semantic
  danger: '#C0392B',

  // ---- back-compat aliases (older screens reference these names) ----
  cream: '#FBFAF6',
  white: '#FFFFFF',
  charcoal: '#1A1C17',
  slate: '#44483D',
  faint: '#6E7268',
  terracotta: '#C2553D',
  terracottaSoft: '#F6E3DA',
  amber: '#C29A2A',
  amberSoft: '#F3EAD2',
} as const;

/**
 * Beli-style color-graded score. Maps a 1.0–5.0 Health Score onto a warm→green
 * ramp — the single most recognizable element of the redesign.
 */
export function scoreColor(value: number): string {
  if (value >= 4.5) return '#54732B'; // deep olive — excellent
  if (value >= 4.0) return '#6E9A38'; // leaf
  if (value >= 3.5) return '#9AA537'; // olive-lime
  if (value >= 3.0) return '#C29A2A'; // gold
  if (value >= 2.5) return '#CC7A33'; // burnt amber
  return '#C2553D'; // terracotta — poor
}

/** Legacy tone bucket (kept for back-compat). */
export function toneColor(tone: 'good' | 'ok' | 'poor'): string {
  if (tone === 'good') return colors.olive;
  if (tone === 'ok') return colors.amber;
  return colors.terracotta;
}

/* ------------------------------- fonts ------------------------------- */
// Registered in app/_layout.tsx via useFonts. Display = Space Grotesk,
// Text = Hanken Grotesk.

export const fonts = {
  display: 'Grove-Display', // Space Grotesk 700
  displayMed: 'Grove-DisplayMed', // Space Grotesk 500
  sans: 'Grove-Sans', // Hanken 400
  sansMed: 'Grove-SansMed', // Hanken 500
  sansSemi: 'Grove-SansSemi', // Hanken 600
  sansBold: 'Grove-SansBold', // Hanken 700
} as const;

const TABULAR = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] };

/* ------------------------------- spacing ----------------------------- */

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  full: 999,
} as const;

/* ----------------------------- typography ---------------------------- */

export const type = {
  // new tokens
  display: { fontFamily: fonts.display, fontSize: 34, color: colors.ink, letterSpacing: -0.6, ...TABULAR },
  stat: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, letterSpacing: -0.3, ...TABULAR },
  brand: { fontFamily: fonts.display, fontSize: 30, color: colors.oliveDeep, letterSpacing: -0.8 },
  micro: { fontFamily: fonts.sansBold, fontSize: 11, color: colors.ink50, letterSpacing: 0.9, textTransform: 'uppercase' as const },
  label: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.oliveDeep },

  // back-compat keys (used widely), restyled onto the new system
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.sansBold, fontSize: 17, color: colors.ink, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 15, color: colors.ink },
  bodyBold: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink70 },
  smallBold: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.ink70 },
  tiny: { fontFamily: fonts.sansMed, fontSize: 11, color: colors.ink50 },
  numeric: TABULAR,
} satisfies Record<string, TextStyle>;

/* ----------------------------- elevation ----------------------------- */
// Soft, green-tinted, low-opacity (not default gray).

export const elevation = {
  card: {
    boxShadow: '0 1px 2px rgba(31, 38, 25, 0.05), 0 8px 24px rgba(31, 38, 25, 0.04)',
  },
  raised: {
    boxShadow: '0 4px 14px rgba(44, 59, 24, 0.18)',
  },
} as const;

/** Back-compat alias. */
export const shadow = { card: elevation.card } as const;

/* ------------------------------ motion ------------------------------- */

export const motion = {
  press: { damping: 18, stiffness: 320, mass: 0.6 },
  enter: { damping: 16, stiffness: 180, mass: 0.9 },
  pressScale: 0.97,
} as const;

/* ------------------------------ labels ------------------------------- */

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const MEAL_TYPE_EMOJI: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '✨',
};
