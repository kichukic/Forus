// Local notifications for new messages received over Socket.io.
// When a friend writes and the user is on another tab, watching a video,
// or multitasking with the app in background, a system banner with sound/vibration
// is scheduled immediately. Tapping it switches to the Chat tab and opens the conversation.
//
// Zero external services or Firebase keys required.
import * as Notifications from 'expo-notifications';
import { isTV, colors } from '../theme';
import type { ChatMessage, ChatUser } from './api';

const CHANNEL = 'messages';

/** Requests notification permission on Android 13+ and registers the high-importance channel. */
export async function setupMessageNotifications() {
  if (isTV) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: colors.accent,
      vibrationPattern: [0, 200, 120, 200],
    });
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Unsupported or permission declined.
  }
}

/** Shows a local notification for an incoming chat message. */
export async function notifyIncomingMessage(sender: ChatUser, message: ChatMessage) {
  if (isTV) return;
  try {
    const preview = message.text || (message.title ? `Sent you: ${message.title.title}` : 'New message');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: sender.name,
        body: preview,
        sound: true,
        data: {
          kind: 'message',
          from: sender.id,
          name: sender.name,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId: CHANNEL,
      },
    });
  } catch {
    // Ignore notification presentation errors.
  }
}

// A conversation a tapped notification asks to open. App switches to the Chat
// tab and the tab opens the conversation; a tap that launched the app is kept
// until the tab is there to take it.
let pending: ChatUser | null = null;
const listeners = new Set<(user: ChatUser) => void>();

export function openChatRequest(user: ChatUser) {
  pending = user;
  listeners.forEach((fn) => fn(user));
}

/**
 * Calls `fn` for each conversation a notification asks to open (and at once
 * for one already waiting). `take` marks it handled.
 */
export function onOpenChatRequest(fn: (user: ChatUser, take: () => void) => void): () => void {
  const listener = (user: ChatUser) =>
    fn(user, () => {
      if (pending === user) pending = null;
    });
  listeners.add(listener);
  if (pending) listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

/** The data on a tapped message notification, as a person to open the chat with. */
export function chatFromNotification(data: Record<string, unknown> | undefined): ChatUser | null {
  if (data?.kind !== 'message' || typeof data.from !== 'string') return null;
  return { id: data.from, name: typeof data.name === 'string' ? data.name : 'Friend' };
}
