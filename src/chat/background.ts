// Keeping the chat connected in the background.
//
// Android moves background apps into a cached state where the system may kill
// them whenever memory is short. That takes the chat's Socket.IO connection
// with it, so messages only show up once the app is opened again. A foreground
// service lifts the app out of that state: the process (and so the socket)
// keeps running behind a quiet, ongoing notification, and a message that comes
// in while the app is in the background still raises its notification.
//
// The service is Android-only. Elsewhere the app simply reconnects when it is
// brought back to the front, as before.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import ChatKeepAlive from '../../modules/chat-keepalive';

const PREF_KEY = 'chat-background-connection';
const ASKED_KEY = 'chat-battery-asked';

export const keepAliveSupported = Platform.OS === 'android' && ChatKeepAlive != null;

// On unless the person turned it off in Settings.
let wanted = true;

/** Reads the saved choice. Call before starting the service. */
export async function loadKeepAlivePreference() {
  const saved = await AsyncStorage.getItem(PREF_KEY).catch(() => null);
  wanted = saved !== 'off';
}

export function keepAliveWanted() {
  return wanted;
}

/**
 * Turns the background connection on or off, and remembers the choice.
 * Only call this while the app is on screen — Android refuses to start a
 * foreground service from the background.
 */
export async function setKeepAlive(on: boolean) {
  wanted = on;
  await AsyncStorage.setItem(PREF_KEY, on ? 'on' : 'off').catch(() => {});
  if (!keepAliveSupported) return;
  try {
    if (on) ChatKeepAlive!.start();
    else ChatKeepAlive!.stop();
  } catch {
    // The phone declined the service; the app still works while it is open.
  }
}

/** Starts the service if the person wants it. Call while the app is visible. */
export function startKeepAlive() {
  if (!wanted || !keepAliveSupported) return;
  try {
    ChatKeepAlive!.start();
  } catch {
    // Ignore: without the service the app just reconnects when reopened.
  }
}

/** Stops the service, e.g. on signing out. */
export function stopKeepAlive() {
  if (!keepAliveSupported) return;
  try {
    ChatKeepAlive!.stop();
  } catch {
    // Nothing to stop.
  }
}

export function keepAliveRunning(): boolean {
  if (!keepAliveSupported) return false;
  try {
    return ChatKeepAlive!.isRunning();
  } catch {
    return false;
  }
}

/** False when Android's battery optimization may still kill the app. */
export function isIgnoringBatteryOptimizations(): boolean {
  if (!keepAliveSupported) return true;
  try {
    return ChatKeepAlive!.isIgnoringBatteryOptimizations();
  } catch {
    return false;
  }
}

export function openBatterySettings() {
  if (!keepAliveSupported) return;
  try {
    ChatKeepAlive!.openBatterySettings();
  } catch {
    // Unsupported on this phone.
  }
}

export function openAppSettings() {
  if (!keepAliveSupported) return;
  try {
    ChatKeepAlive!.openAppSettings();
  } catch {
    // Unsupported on this phone.
  }
}

/**
 * Asks once, the first time the chat is opened, to exempt the app from
 * Android's battery optimization. Without the exemption many phones (Xiaomi,
 * Realme, Oppo, vivo, Samsung) still stop even a foreground service after a
 * while. Returns immediately when the app is already exempt or was asked.
 */
export async function maybeAskForBatteryExemption() {
  if (!keepAliveSupported || !wanted) return;
  if (isIgnoringBatteryOptimizations()) return;
  if (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) return;
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  Alert.alert(
    'Keep messages coming',
    'Android may stop ForUs while it is in the background, so new messages arrive late. Allow unrestricted battery use to stay connected.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Allow', onPress: openBatterySettings },
    ],
  );
}
