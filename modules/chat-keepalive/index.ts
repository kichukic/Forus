import { requireOptionalNativeModule } from 'expo';

/**
 * The Android foreground service that keeps the chat connected while the app
 * is in the background. It is Android-only; on every other platform this is
 * null and the app falls back to reconnecting when it comes back on screen.
 */
export type ChatKeepAliveModule = {
  /** Starts the service. Must be called while the app is on screen. */
  start(): boolean;
  stop(): boolean;
  isRunning(): boolean;
  /** False when battery optimization may still kill the app in the background. */
  isIgnoringBatteryOptimizations(): boolean;
  /** Opens the system dialog that exempts the app from battery optimization. */
  openBatterySettings(): boolean;
  /** Opens the app's system settings page (autostart on some phones). */
  openAppSettings(): boolean;
};

export default requireOptionalNativeModule<ChatKeepAliveModule>('ChatKeepAlive');
