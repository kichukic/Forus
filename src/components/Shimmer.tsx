// The band of light that sweeps across a picture that hasn't arrived yet.
// Every shimmering picture shares one animation, which runs only while at
// least one of them is on screen, so a row of loading cards costs no more
// than a single one and nothing keeps moving once the pictures are in.
import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CARD_WIDTH } from '../theme';

const SWEEP_MS = 1300;
const sweep = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function useSharedSweep() {
  useEffect(() => {
    if (users++ === 0) {
      sweep.setValue(0);
      loop = Animated.loop(
        Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      );
      loop.start();
    }
    return () => {
      if (--users === 0) {
        loop?.stop();
        loop = null;
      }
    };
  }, []);
}

/** Fills its parent; `width` is how far the band travels. */
export function Shimmer({ width = CARD_WIDTH }: { width?: number }) {
  useSharedSweep();
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width * 1.2] });
  return (
    <View style={styles.clip} pointerEvents="none">
      <Animated.View style={[styles.band, { width: width * 0.45, transform: [{ translateX }, { rotate: '16deg' }] }]}>
        <LinearGradient
          colors={['transparent', 'rgba(185,138,255,0.20)', 'rgba(255,255,255,0.10)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  band: { position: 'absolute', top: '-40%', bottom: '-40%' },
});
