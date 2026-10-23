// The native fullscreen button: the video should fill the screen, so the phone
// turns sideways while fullscreen lasts and hands the choice back afterwards.
import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

export function useFullscreenOrientation() {
  // Closing the player anywhere must never leave the phone stuck sideways.
  useEffect(() => () => {
    ScreenOrientation.unlockAsync().catch(() => {});
  }, []);
  return {
    onFullscreenEnter: () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    },
    onFullscreenExit: () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    },
  };
}
