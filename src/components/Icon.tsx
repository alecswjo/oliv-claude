import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { colors } from './theme';

/**
 * The line-icon set — Feather everywhere (clean, consistent strokes), plus one
 * MaterialCommunityIcons `fire` for streaks. Replacing emoji UI chrome with
 * these is the single biggest "not AI-generated" fix.
 */

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({
  name,
  size = 20,
  color = colors.ink,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  return <Feather name={name} size={size} color={color} style={style} accessibilityLabel={accessibilityLabel} />;
}

export function Flame({ size = 16, color = colors.ember }: { size?: number; color?: string }) {
  return <MaterialCommunityIcons name="fire" size={size} color={color} />;
}
