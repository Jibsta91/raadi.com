import { Alert, Platform } from 'react-native';

/** A yes/no question: the native alert on devices, window.confirm in the web build (no Alert there). */
export function confirm(
  title: string,
  message: string,
  ok: string,
  cancel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
