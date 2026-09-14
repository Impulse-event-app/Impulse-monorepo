// confirm.ts — ask before a destructive action. Native uses the system alert
// with a destructive-styled button (HIG: red means destructive, and the
// brand accent is also red, so the system alert is what signals the stakes).
// react-native-web's Alert is a no-op, so the web falls back to confirm().
import { Alert, Platform } from 'react-native';

export function confirmDestructive(
  title: string,
  message: string,
  actionLabel: string,
  cancelLabel = 'Cancel',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
