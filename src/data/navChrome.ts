// Whether the bottom bar should be tucked away. Screens that scroll tell it
// when the user is heading down (hide) or back up (show); the bar animates
// itself in response. A single module store, read with useSyncExternalStore,
// so any scrolling screen can drive it without prop-drilling through App.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

// How far the finger has to travel, in points, before the bar commits to a
// direction. Small jiggles near the boundary shouldn't flicker the bar.
const HIDE_SLOP = 24;
// Scrolled up to here, the bar is always shown, however it got there.
const TOP_ZONE = 40;

let hidden = false;
const listeners = new Set<() => void>();

export function setNavHidden(next: boolean) {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The bar reads this to decide whether it's on screen or tucked below it. */
export function useNavHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden);
}

/**
 * A handler for a screen's list scroll. Give it the vertical offset on each
 * scroll: moving down past the slop hides the bar, moving back up shows it,
 * and reaching the top always shows it. Leaving the screen brings it back.
 */
export function useNavScrollHide() {
  const last = useRef(0);
  useEffect(() => () => setNavHidden(false), []);
  return useCallback((y: number) => {
    const delta = y - last.current;
    if (y <= TOP_ZONE) setNavHidden(false);
    else if (delta > HIDE_SLOP) setNavHidden(true);
    else if (delta < -HIDE_SLOP) setNavHidden(false);
    last.current = y;
  }, []);
}
