import React, { useRef } from 'react';
import {
  Animated,
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
import { Icon, type IconName } from './Icon';
import { colors, elevation, fonts, motion, radius, spacing, type } from './theme';

/* ----------------------- press-scale (tactile feel) ---------------------- */

interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children: React.ReactNode;
}

export function PressableScale({ style, scaleTo = motion.pressScale, children, ...rest }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  return (
    <Pressable onPressIn={() => to(scaleTo)} onPressOut={() => to(1)} {...rest}>
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

/* -------------------------------- card --------------------------------- */

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* ------------------------------- button -------------------------------- */

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', loading, disabled, icon, style, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === 'primary' ? colors.surface
      : variant === 'danger' ? colors.danger
      : variant === 'secondary' ? colors.oliveDeep
      : colors.olive;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      style={[
        styles.button,
        variant === 'primary' && { backgroundColor: colors.olive, ...elevation.raised, shadowOpacity: 0.14 },
        variant === 'secondary' && { backgroundColor: colors.oliveSoft },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        variant === 'danger' && { backgroundColor: colors.surface, borderWidth: 1, borderColor: '#EAD7D2' },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
      {...rest}>
      {loading ? (
        <Text style={[styles.buttonText, { color: textColor }]}>…</Text>
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={18} color={textColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/* -------------------------------- field -------------------------------- */

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: spacing(1.5) }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.ink30}
        style={[styles.field, style]}
        accessibilityLabel={label ?? rest.placeholder}
        {...rest}
      />
    </View>
  );
}

/* --------------------------------- chip -------------------------------- */

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
        tone ? { backgroundColor: tone, borderColor: tone } : null,
      ]}>
      <Text style={[styles.chipText, selected && { color: colors.surface }]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}>
      {body}
    </PressableScale>
  );
}

/* -------------------------------- pill --------------------------------- */

/** Small solid pill (e.g. graded score). */
export function Pill({ text, color, dark }: { text: string; color: string; dark?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={[styles.pillText, { color: dark ? colors.oliveDeep : colors.surface }]}>{text}</Text>
    </View>
  );
}

/* --------------------------------- bar --------------------------------- */

export function Bar({
  value,
  max,
  color = colors.olive,
  height = 7,
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
      <View style={{ width: `${ratio * 100}%`, backgroundColor: color, height, borderRadius: height / 2 }} />
    </View>
  );
}

/* ------------------------------- section ------------------------------- */

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

/* ------------------------------ empty state ---------------------------- */

export function EmptyState({
  icon,
  emoji,
  title,
  body,
  action,
}: {
  icon?: IconName;
  emoji?: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyBadge}>
        {icon ? <Icon name={icon} size={26} color={colors.olive} /> : <Text style={{ fontSize: 26 }}>{emoji ?? '🫒'}</Text>}
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.small, { textAlign: 'center', lineHeight: 20 }]}>{body}</Text>
      {action ? <View style={{ marginTop: spacing(2) }}>{action}</View> : null}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    ...elevation.card,
  },
  button: {
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(5),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  buttonText: { fontFamily: fonts.sansBold, fontSize: 16, letterSpacing: -0.1 },
  fieldLabel: { ...type.label },
  field: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontFamily: fonts.sansMed,
    fontSize: 16,
    color: colors.ink,
    minHeight: 50,
  },
  chip: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3.5),
    borderRadius: radius.full,
    backgroundColor: colors.fill,
    borderWidth: 1,
    borderColor: colors.line,
    alignSelf: 'flex-start',
  },
  chipText: { fontFamily: fonts.sansSemi, fontSize: 13, color: colors.ink70 },
  pill: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.display, fontSize: 13, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  barTrack: { backgroundColor: colors.fill, overflow: 'hidden', flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: {
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(12),
    paddingHorizontal: spacing(6),
  },
  emptyBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.oliveSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
