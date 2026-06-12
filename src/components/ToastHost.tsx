import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useToastStore } from '@/store/toastStore';
import { colors, fonts, radius, spacing } from './theme';

const VISIBLE_MS = 2200;

/** Bottom toast pill — rendered once in the root layout, above the Stack. */
export function ToastHost() {
  const message = useToastStore((state) => state.message);
  const seq = useToastStore((state) => state.seq);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        useToastStore.getState().clear(),
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, seq, opacity]);

  if (!message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <Animated.Text style={styles.text} accessibilityLiveRegion="polite">
        {message}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: spacing(28),
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.full,
    paddingHorizontal: spacing(4.5),
    paddingVertical: spacing(2.5),
    maxWidth: '86%',
  },
  text: { color: colors.surface, fontFamily: fonts.sansSemi, fontSize: 14 },
});
