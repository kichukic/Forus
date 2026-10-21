// System notifications for the transfers that run in the background: one when a
// release is added, one at the halfway mark, and one when it is ready to play.
// A tap on the "ready" one plays the file, through the same path as the
// "Continue watching" reminder.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors, isTV } from '../theme';
import type { Transfer } from './transfers';

const PROGRESS_CHANNEL = 'torbox-transfers';
const READY_CHANNEL = 'torbox-ready';
const PROGRESS_ID_PREFIX = 'torbox-progress-';
const READY_ID_PREFIX = 'torbox-ready-';

export async function setupTransferNotices() {
  if (isTV) return;
  try {
    await Notifications.setNotificationChannelAsync(PROGRESS_CHANNEL, {
      name: 'TorBox transfers',
      importance: Notifications.AndroidImportance.LOW,
      lightColor: colors.accent,
    });
    await Notifications.setNotificationChannelAsync(READY_CHANNEL, {
      name: 'TorBox ready',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: colors.accent,
    });
  } catch {
    // The channel calls are a no-op on iOS and on older Android.
  }
}

export async function ensureTransferPermission() {
  if (isTV) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

export async function notifyTransferAdded(transfer: Transfer) {
  if (isTV) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Added to TorBox',
        body: `${transfer.title} — it will play here when it's ready.`,
        data: { transferId: transfer.id },
        color: colors.accent,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: PROGRESS_CHANNEL },
    });
  } catch {
    // Notifications are a courtesy; never break the transfer.
  }
}

export async function notifyTransferProgress(transfer: Transfer) {
  if (isTV) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${PROGRESS_ID_PREFIX}${transfer.id}`,
      content: {
        title: 'Downloading in TorBox',
        body: `${transfer.title} — ${Math.round(transfer.progress)}%`,
        data: { transferId: transfer.id },
        color: colors.accent,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: PROGRESS_CHANNEL },
    });
  } catch {
    // ignore
  }
}

export async function notifyTransferReady(transfer: Transfer, playable: { kind: 'file'; source: 'torrents'; itemId: number; fileId: number; title: string }) {
  if (isTV) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${READY_ID_PREFIX}${transfer.id}`,
      content: {
        title: 'Ready in TorBox',
        body: `${transfer.title} — tap to play.`,
        data: { item: playable },
        color: colors.accent,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: READY_CHANNEL },
    });
  } catch {
    // ignore
  }
}
