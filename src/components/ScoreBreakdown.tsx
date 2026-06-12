import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HealthScore } from '@/domain/types';
import { colors, fonts, spacing, type } from './theme';

/** Factor-by-factor score explanation — spec §F5/§6.4. */
export function ScoreBreakdown({ score }: { score: HealthScore }) {
  return (
    <View style={{ gap: spacing(2) }}>
      {score.factors.map((factor) => {
        const positive = factor.delta > 0;
        const neutral = factor.delta === 0;
        const tint = positive ? colors.olive : neutral ? colors.ink30 : colors.terracotta;
        return (
          <View key={factor.factor} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: tint }]} />
            <Text style={[type.body, { flex: 1 }]}>{factor.label}</Text>
            <View style={[styles.deltaPill, { backgroundColor: `${tint}1A` }]}>
              <Text style={[styles.delta, { color: tint }]}>
                {neutral ? '·' : `${positive ? '+' : ''}${factor.delta.toFixed(2)}`}
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={[type.tiny, { paddingTop: spacing(1) }]}>
        Every meal starts at 3.0 — factors move it up or down.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5) },
  dot: { width: 7, height: 7, borderRadius: 4 },
  deltaPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, minWidth: 46, alignItems: 'center' },
  delta: { fontFamily: fonts.display, fontSize: 13, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
});
