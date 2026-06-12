import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { scoreTone } from '@/domain/healthScore';
import { colors, toneColor } from './theme';

/**
 * 1–5 olives + numeric chip — spec §F5/§9.
 * Olives are drawn (not emoji) so half-fills render exactly.
 */

function Olive({ fill, color, size }: { fill: 'full' | 'half' | 'empty'; color: string; size: number }) {
  return (
    <View
      style={[
        styles.olive,
        {
          width: size,
          height: size * 1.18,
          borderRadius: size,
          borderColor: color,
          backgroundColor: fill === 'full' ? color : 'transparent',
        },
      ]}>
      {fill === 'half' ? (
        <View
          style={{
            width: size / 2 - 1.5,
            height: size * 1.18 - 3,
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
  const color = toneColor(scoreTone(value));
  const oliveSize = size === 'lg' ? 16 : size === 'md' ? 12 : 9;

  const fills: ('full' | 'half' | 'empty')[] = [1, 2, 3, 4, 5].map((slot) => {
    if (value >= slot) return 'full';
    if (value >= slot - 0.5) return 'half';
    return 'empty';
  });

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={`Health score ${value} out of 5`}>
      <View style={[styles.olives, { gap: oliveSize / 4 }]}>
        {fills.map((fill, index) => (
          <Olive key={index} fill={fill} color={color} size={oliveSize} />
        ))}
      </View>
      {showNumber ? (
        <View style={[styles.chip, { backgroundColor: color }]}>
          <Text style={styles.chipText}>{value.toFixed(1)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  olives: { flexDirection: 'row', alignItems: 'center' },
  olive: {
    borderWidth: 1.5,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipText: { color: colors.white, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
