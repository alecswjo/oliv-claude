import type { TextStyle } from 'react-native';

/** Oliv visual system — spec §9. Light mode only in V1. */

export const colors = {
  olive: '#708238',
  oliveDeep: '#3D4A1F',
  oliveSoft: '#E4EAD5',
  cream: '#FAF7F0',
  white: '#FFFFFF',
  charcoal: '#23231F',
  slate: '#6F6F66',
  faint: '#A8A89D',
  terracotta: '#C96F4A',
  terracottaSoft: '#F6E3DA',
  amber: '#B8860B',
  amberSoft: '#F3EAD2',
  line: '#ECE8DE',
  danger: '#C0392B',
} as const;

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: '800', color: colors.charcoal, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.charcoal, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400', color: colors.charcoal },
  bodyBold: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  small: { fontSize: 13, fontWeight: '400', color: colors.slate },
  smallBold: { fontSize: 13, fontWeight: '600', color: colors.slate },
  tiny: { fontSize: 11, fontWeight: '500', color: colors.faint },
  numeric: { fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const shadow = {
  card: {
    shadowColor: '#3D4A1F',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

/** Health-score tones (spec §9). */
export function toneColor(tone: 'good' | 'ok' | 'poor'): string {
  if (tone === 'good') return colors.olive;
  if (tone === 'ok') return colors.amber;
  return colors.terracotta;
}

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
