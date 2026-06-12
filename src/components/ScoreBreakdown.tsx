import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HealthScore } from '@/domain/types';
import { colors, spacing, type } from './theme';

/** Factor-by-factor score explanation — spec §F5/§6.4. */
export function ScoreBreakdown({ score }: { score: HealthScore }) {
  return (
    <View style={{ gap: spacing(2) }}>
      {score.factors.map((factor) => {
        const positive = factor.delta > 0;
        const neutral = factor.delta === 0;
        return (
          <View key={factor.factor} style={styles.row}>
            <Text style={[type.body, { flex: 1 }]}>{factor.label}</Text>
            <Text
              style={[
                styles.delta,
                positive && { color: colors.olive },
                !positive && !neutral && { color: colors.terracotta },
                neutral && { color: colors.faint },
              ]}>
              {neutral ? '·' : `${positive ? '+' : ''}${factor.delta.toFixed(2)}`}
            </Text>
          </View>
        );
      })}
      <View style={styles.baseRow}>
        <Text style={type.tiny}>Every meal starts at 3.0 — factors move it up or down.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  delta: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  baseRow: { paddingTop: spacing(1) },
});
