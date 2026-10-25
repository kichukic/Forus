// Wraps a screen so it eases in when it mounts, instead of snapping onto the
// screen. A short upward slide and fade driven by one spring, so switching tabs
// or opening a detail reads as motion rather than a jump. TVs get a snappier,
// smaller version because the remote moves faster than a finger.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { isTV, sz } from '../theme';

type Props = {
  children: ReactNode;
  // Extra styles (positioning, the hidden flag) merged onto the animated root.
  style?: StyleProp<ViewStyle>;
};

export function ScreenReveal({ children, style }: Props) {
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(shown, {
      toValue: 1,
      useNativeDriver: true,
      // TV: quick and tight. Phone: a touch more glide.
      speed: isTV ? 30 : 16,
      bounciness: 0,
    }).start();
  }, [shown]);
  const translateY = shown.interpolate({ inputRange: [0, 1], outputRange: [sz(isTV ? 10 : 22, 10), 0] });
  return (
    <Animated.View style={[style, { opacity: shown, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
