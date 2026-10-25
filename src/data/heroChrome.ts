// How far the home page is scrolled, as a 0..1 signal that drives the header
// collapsing into a compact frosted bar. The scrolling list and the header live
// in different components, so they share one module-level Animated.Value rather
// than prop-drilling through the screens. TVs never condense (the remote needs
// the roomy layout and stable focus), so on a TV the value stays pinned at 0.
import { Animated, Easing } from 'react-native';
import { isTV } from '../theme';

// One shared progress value: 0 at the very top, 1 once scrolled past FUSE.
export const heroProgress = new Animated.Value(0);

// Points of scroll it takes to fully collapse the hero.
const FUSE = 120;
// Ignore sub-pixel churn so we don't restart the animation on every event.
const EPSILON = 0.02;

let target = 0;

/** Feed the vertical scroll offset in; the header animates toward the match. */
export function setHeroScroll(y: number) {
  if (isTV) return;
  const next = Math.max(0, Math.min(1, y / FUSE));
  if (Math.abs(next - target) < EPSILON) return;
  target = next;
  Animated.timing(heroProgress, {
    toValue: next,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    // Height is interpolated from this value, which the native driver can't do.
    useNativeDriver: false,
  }).start();
}

/** Snap back to the expanded header (tab switch, or the remote's go-top). */
export function resetHeroScroll() {
  target = 0;
  heroProgress.setValue(0);
}
