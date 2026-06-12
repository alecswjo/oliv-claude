import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirm dialog. React Native Web's `Alert` is a silent no-op
 * (buttons never render), which made every confirm-gated action — sign out,
 * delete meal, reset — dead on web. On web we use the browser dialog; on
 * native, the familiar Alert.
 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    const w = globalThis as unknown as { confirm?: (text: string) => boolean };
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    // Fail CLOSED: a missing confirm dialog must never auto-approve a
    // destructive action.
    return Promise.resolve(w.confirm ? w.confirm(text) : false);
  }
  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
