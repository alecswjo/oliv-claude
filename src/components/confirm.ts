import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/**
 * Cross-platform destructive confirm. React Native Web's Alert is a silent
 * no-op — a confirm built on Alert.alert simply does nothing in the browser —
 * so use window.confirm there.
 */
export function confirmDestructive({ title, message, confirmLabel, onConfirm }: ConfirmOptions) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
