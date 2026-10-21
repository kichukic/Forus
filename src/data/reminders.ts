// Phones: a nudge to come back to what was being watched. When the app is
// left after watching something, a notification naming it goes off five
// minutes later; coming back before then cancels it. Leaving without a player
// open, and without having played anything on that visit, schedules nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { colors } from '../theme';
import type { Playable } from '../types';
import { stripEmoji } from './text';

const CHANNEL = 'continue-watching';
const REMIND_AFTER_S = 5 * 60;
// The id of the reminder waiting to go off, kept so a later launch can cancel it.
const PENDING_KEY = 'reminder-pending';
// Whether something was played since the app was last left.
let watchedThisVisit = false;

// Only things that open straight back up; live channels are always "now".
function remindable(item: Playable | undefined): item is Extract<Playable, { kind: 'video' | 'file' }> {
  return item?.kind === 'video' || item?.kind === 'file';
}

// "Title | Actor | Channel" reads best as just the title.
function shortTitle(title: string) {
  const plain = stripEmoji(title);
  const head = plain.split('|')[0].trim();
  return head.length >= 4 ? head : plain;
}

async function schedule(item: Playable | undefined, watching: boolean) {
  if (!(watching || watchedThisVisit) || !remindable(item)) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  await cancel();
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Continue watching',
      body: shortTitle(item.title),
      data: { item },
      color: colors.accent,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: REMIND_AFTER_S, channelId: CHANNEL },
  });
  await AsyncStorage.setItem(PENDING_KEY, id);
}

// Called on coming back: a reminder that hasn't gone off yet is withdrawn.
async function cancel() {
  const id = await AsyncStorage.getItem(PENDING_KEY);
  if (!id) return;
  await AsyncStorage.removeItem(PENDING_KEY);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

/**
 * Starts the reminders. `latest` gives what was watched last, `watching`
 * whether a player is open, and `onOpen` plays an item when its notification
 * is tapped. Returns the cleanup.
 */
export function startReminders(
  latest: () => Playable | undefined,
  watching: () => boolean,
  onOpen: (item: Playable) => void,
): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  // Android 13 only asks for permission once a channel exists.
  Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Continue watching',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.accent,
  }).catch(() => {});

  const open = (response: Notifications.NotificationResponse | null) => {
    const item = response?.notification.request.content.data?.item as Playable | undefined;
    if (item) onOpen(item);
  };
  // A tap that launched the app from closed.
  open(Notifications.getLastNotificationResponse());
  Notifications.clearLastNotificationResponse();
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
    open(response);
    Notifications.clearLastNotificationResponse();
  });

  cancel().catch(() => {});
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'background') {
      schedule(latest(), watching()).catch(() => {});
      watchedThisVisit = false;
    } else if (state === 'active') {
      cancel().catch(() => {});
    }
  });

  return () => {
    tapped.remove();
    appState.remove();
  };
}

/**
 * Called on each play: marks this visit as one worth a reminder, and the first
 * time asks for permission to notify.
 */
export async function askToRemind() {
  watchedThisVisit = true;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch {
    // Not being allowed just means no reminders.
  }
}
