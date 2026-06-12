import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadow, spacing, type } from './theme';

/** Shared UI kit — small, dependency-free building blocks. */

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.olive },
        variant === 'secondary' && { backgroundColor: colors.oliveSoft },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        variant === 'danger' && { backgroundColor: colors.terracottaSoft },
        pressed && { opacity: 0.85 },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.olive} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && { color: colors.white },
            variant === 'secondary' && { color: colors.oliveDeep },
            variant === 'ghost' && { color: colors.olive },
            variant === 'danger' && { color: colors.danger },
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: spacing(1.5) }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.field, style]}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
      />
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: string;
}) {
  const body = (
    <View
      style={[
        styles.chip,
        selected && { backgroundColor: colors.oliveDeep },
        tone ? { backgroundColor: tone } : null,
      ]}>
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!selected }} onPress={onPress}>
      {body}
    </Pressable>
  );
}

export function Bar({
  value,
  max,
  color = colors.olive,
  height = 8,
  testID,
}: {
  value: number;
  max: number;
  color?: string;
  height?: number;
  testID?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={[styles.barTrack, { height, borderRadius: height / 2 }]} testID={testID}>
      <View
        style={{
          width: `${ratio * 100}%`,
          backgroundColor: color,
          height,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={{ gap: spacing(2.5) }}>
      <View style={styles.sectionHeader}>
        <Text style={type.heading}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 44 }}>{emoji}</Text>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center', lineHeight: 19 }]}>{body}</Text>
      {action ? <View style={{ marginTop: spacing(2) }}>{action}</View> : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing(4),
    ...shadow.card,
  },
  button: {
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(5),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  fieldLabel: { ...type.smallBold, color: colors.oliveDeep },
  field: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: colors.charcoal,
    minHeight: 48,
  },
  chip: {
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(3),
    borderRadius: radius.full,
    backgroundColor: colors.oliveSoft,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.oliveDeep },
  barTrack: { backgroundColor: colors.oliveSoft, overflow: 'hidden', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: {
    alignItems: 'center',
    gap: spacing(2.5),
    paddingVertical: spacing(10),
    paddingHorizontal: spacing(6),
  },
});
