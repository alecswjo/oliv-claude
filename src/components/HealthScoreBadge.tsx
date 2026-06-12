import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, scoreColor } from './theme';

/**
 * OliveScore — Beli-style color-graded score (1.0–5.0). Five olive glyphs tinted
 * by the score's grade, plus the value on a graded chip. The color *is* the
 * signal (Beli's move), so it reads at a glance.
 */

function Olive({ fill, color, size }: { fill: 'full' | 'half' | 'empty'; color: string; size: number }) {
  return (
    <View
      style={[
        styles.olive,
        {
          width: size,
          height: size * 1.16,
          borderRadius: size,
          borderColor: color,
          backgroundColor: fill === 'full' ? color : 'transparent',
          opacity: fill === 'empty' ? 0.28 : 1,
        },
      ]}>
      {fill === 'half' ? (
        <View
          style={{
            width: size / 2 - 1.4,
            height: size * 1.16 - 2.8,
            backgroundColor: color,
            borderTopLeftRadius: size,
            borderBottomLeftRadius: size,
          }}
        />
      ) : null}
    </View>
  );
}

export function HealthScoreBadge({
  value,
  size = 'md',
  showNumber = true,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
}) {
  const color = scoreColor(value);
  const oliveSize = size === 'lg' ? 15 : size === 'md' ? 11 : 8.5;
  const fills: ('full' | 'half' | 'empty')[] = [1, 2, 3, 4, 5].map((slot) =>
    value >= slot ? 'full' : value >= slot - 0.5 ? 'half' : 'empty',
  );

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={`Health score ${value} out of 5`}>
      <View style={[styles.olives, { gap: oliveSize / 4.5 }]}>
        {fills.map((fill, i) => (
          <Olive key={i} fill={fill} color={color} size={oliveSize} />
        ))}
      </View>
      {showNumber ? (
        <View style={[styles.chip, { backgroundColor: color }]}>
          <Text style={[styles.chipText, size === 'lg' && { fontSize: 15 }]}>{value.toFixed(1)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  olives: { flexDirection: 'row', alignItems: 'center' },
  olive: { borderWidth: 1.5, overflow: 'hidden', justifyContent: 'center' },
  chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2.5, minWidth: 30, alignItems: 'center' },
  chipText: { color: colors.surface, fontFamily: fonts.display, fontSize: 13, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
});
