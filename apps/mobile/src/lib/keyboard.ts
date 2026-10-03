import { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * How far to lift an element pinned to the bottom of the screen so it stays above the keyboard, as an
 * Animated value for `transform: [{ translateY }]` (negative = up). `restingBottom` is the element's
 * normal distance from the screen's bottom edge. iOS moves it with the keyboard's own animation; Android
 * follows once the keyboard is shown. The web never moves it (browsers resize the page instead).
 */
export function useKeyboardLift(restingBottom: number, gap = 8): Animated.Value {
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const move = (to: number, duration: number) =>
      Animated.timing(lift, { toValue: to, duration, useNativeDriver: true }).start();
    const show = (e: KeyboardEvent) =>
      move(-Math.max(e.endCoordinates.height + gap - restingBottom, 0), ios ? e.duration : 120);
    const hide = (e: KeyboardEvent) => move(0, ios ? e.duration : 120);
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', show),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', hide),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, [gap, lift, restingBottom]);

  return lift;
}
