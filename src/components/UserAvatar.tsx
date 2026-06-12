import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function UserAvatar({
  emoji,
  color,
  size = 44,
}: {
  emoji: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, borderColor: color },
      ]}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
