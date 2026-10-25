// The chat's state, shared by every chat screen and the bottom bar's unread
// badge: who is signed in, the conversation list, friends and requests, and
// the messages of each open conversation. While the app is in front it keeps a
// live connection to the server, so new messages and requests arrive at once;
// in the background the connection is closed and everything is refreshed on
// coming back.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { setupMessageNotifications, notifyIncomingMessage } from './push';
import * as api from './api';
import { uploadVoice } from './voice';
import type { ChatMessage, ChatUser, Conversation, FriendLists, Me } from './api';

type Thread = { messages: ChatMessage[]; more: boolean; loading: boolean };

export type ChatState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  conversations: Conversation[] | null;
  friends: FriendLists | null;
  threads: Record<string, Thread>;
  // Whether the live connection is up.
  live: boolean;
};

let state: ChatState = { status: 'loading', me: null, conversations: null, friends: null, threads: {}, live: false };
const listeners = new Set<() => void>();
let socket: Socket | null = null;
// The conversation on screen; its new messages are marked read straight away.
let openWith: string | null = null;

function set(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useChat(): ChatState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Just whether someone is signed in, for screens that care about nothing else. */
export function useChatStatus(): ChatState['status'] {
  return useSyncExternalStore(subscribe, () => state.status);
}

/** Unread messages across every conversation, for the bottom bar. */
export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, () => (state.conversations ?? []).reduce((n, c) => n + c.unread, 0));
}

/** Whether the signed-in user is an administrator (has isAdmin or isadmin). */
export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, () => Boolean(state.me?.isAdmin || (state.me as any)?.isadmin));
}

/** Sends an active screen time heartbeat over socket.io */
export function sendScreenTimeHeartbeat(seconds = 30) {
  if (socket?.connected) {
    socket.emit('screen-time-heartbeat', { seconds });
  }
}

// ---- Session ----

let started = false;

/** Called once at launch: restores the sign-in and starts the connection. */
export async function startChat() {
  if (started) return;
  started = true;
  let bgTimeout: ReturnType<typeof setTimeout> | null = null;
  AppState.addEventListener('change', (s) => {
    if (state.status !== 'signedIn') return;
    if (s === 'active') {
      if (bgTimeout) {
        clearTimeout(bgTimeout);
        bgTimeout = null;
      }
      connect();
      refresh();
    } else if (s === 'background') {
      // Keep socket alive for 5 minutes in background so multitasking still delivers message notifications
      if (!bgTimeout) {
        bgTimeout = setTimeout(() => {
          disconnect();
          bgTimeout = null;
        }, 5 * 60 * 1000);
      }
    }
  });
  if (!(await api.loadSession())) return set({ status: 'signedOut' });
  try {
    set({ me: await api.getMe(), status: 'signedIn' });
    connect();
    refresh();
    setupMessageNotifications();
  } catch (e) {
    // An expired sign-in; anything else (offline) keeps the session for later.
    if (e instanceof api.ChatError && e.status === 401) await signOut();
    else set({ status: 'signedIn' });
  }
}

async function signedIn(me: Me) {
  set({ me, status: 'signedIn', conversations: null, friends: null, threads: {} });
  connect();
  refresh();
  setupMessageNotifications();
}

export async function signIn(email: string, password: string) {
  await signedIn(await api.signIn(email, password));
}

/**
 * Signs in with a phone number or email Phone.Email just verified. Something
 * new isn't signed in yet: the ticket comes back, to finish with a name in
 * `finishSignUp`.
 */
async function verifiedSignIn(result: api.VerifiedSignIn): Promise<{ ticket: string; suggestedName?: string } | null> {
  if (!result.isNew) {
    await signedIn(result.user);
    return null;
  }
  return { ticket: result.ticket, suggestedName: result.suggestedName };
}

export const phoneSignIn = async (accessToken: string) => verifiedSignIn(await api.phoneLogin(accessToken));
export const emailSignIn = async (resultUrl: string) => verifiedSignIn(await api.emailLogin(resultUrl));

export async function finishSignUp(ticket: string, name: string) {
  await signedIn(await api.signUp(ticket, name));
}

export async function signOut() {
  disconnect();
  await api.signOut();
  set({ status: 'signedOut', me: null, conversations: null, friends: null, threads: {} });
}

export async function updateName(name: string) {
  set({ me: await api.updateName(name) });
}

export async function verifyPhone(accessToken: string) {
  set({ me: await api.verifyPhone(accessToken) });
}

export async function removePhone() {
  set({ me: await api.removePhone() });
}

export async function verifyEmail(resultUrl: string) {
  set({ me: await api.verifyEmail(resultUrl) });
}

export async function removeEmail() {
  set({ me: await api.removeEmail() });
}

/** Reloads the conversation list and friends. */
export async function refresh() {
  if (state.status !== 'signedIn') return;
  const [conversations, friends] = await Promise.all([
    api.getConversations().catch(() => state.conversations),
    api.getFriends().catch(() => state.friends),
  ]);
  set({ conversations, friends });
}

// ---- Live connection ----

function connect() {
  if (socket || !api.sessionToken()) return;
  socket = io(api.serverAddress(), {
    auth: { token: api.sessionToken() },
    transports: ['websocket'],
    reconnectionDelayMax: 10000,
  });
  socket.on('connect', () => set({ live: true }));
  socket.on('disconnect', () => set({ live: false }));
  socket.on('message', ({ message, from }: { message: ChatMessage; from?: ChatUser }) => received(message, from));
  socket.on('read', ({ userId, with: other, at }: { userId: string; with?: string; at: string }) => {
    if (userId === state.me?.id && other) {
      // Read on another of my devices.
      setUnread(other, 0);
    } else {
      // The friend read what I sent them.
      updateThread(userId, (t) => ({
        ...t,
        messages: t.messages.map((m) => (m.sender === state.me?.id && !m.readAt ? { ...m, readAt: at } : m)),
      }));
    }
  });
  for (const event of ['friend-request', 'friend-accepted', 'friend-removed']) {
    socket.on(event, () => api.getFriends().then((friends) => set({ friends })).catch(() => {}));
  }
}

function disconnect() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  set({ live: false });
}

// ---- Conversations ----

function updateThread(userId: string, fn: (t: Thread) => Thread) {
  const thread = state.threads[userId];
  if (thread) set({ threads: { ...state.threads, [userId]: fn(thread) } });
}

function setUnread(userId: string, unread: number) {
  set({ conversations: state.conversations?.map((c) => (c.user.id === userId ? { ...c, unread } : c)) ?? null });
}

/** A message sent or received: added to its thread and to the top of the list. */
function received(message: ChatMessage, from?: ChatUser) {
  const mine = message.sender === state.me?.id;
  const otherId = mine ? message.recipient : message.sender;
  updateThread(otherId, (t) =>
    t.messages.some((m) => m.id === message.id) ? t : { ...t, messages: [message, ...t.messages] },
  );

  const open = otherId === openWith;
  if (!mine && open) api.markRead(otherId).catch(() => {});
  const list = state.conversations ?? [];
  const existing = list.find((c) => c.user.id === otherId);
  const user = existing?.user ?? (!mine ? from : findFriend(otherId));
  if (!user) return refresh();
  const unread = (existing?.unread ?? 0) + (!mine && !open ? 1 : 0);
  set({ conversations: [{ user, last: message, unread }, ...list.filter((c) => c.user.id !== otherId)] });

  if (!mine && !open) {
    notifyIncomingMessage(user, message);
  }
}

function findFriend(userId: string): ChatUser | undefined {
  return state.friends?.friends.find((f) => f.user.id === userId)?.user;
}

/** A conversation coming on screen: loads it and marks it read. */
export async function openConversation(userId: string) {
  openWith = userId;
  if (!state.threads[userId]) {
    set({ threads: { ...state.threads, [userId]: { messages: [], more: false, loading: true } } });
  }
  setUnread(userId, 0);
  api.markRead(userId).catch(() => {});
  try {
    const page = await api.getMessages(userId);
    // Messages that arrived live while the page loaded are kept.
    updateThread(userId, (t) => {
      const ids = new Set(page.messages.map((m) => m.id));
      const live = t.messages.filter((m) => !ids.has(m.id));
      return { messages: [...live, ...page.messages], more: page.more, loading: false };
    });
  } catch {
    updateThread(userId, (t) => ({ ...t, loading: false }));
  }
}

export function closeConversation(userId: string) {
  if (openWith === userId) openWith = null;
}

/** The page of older messages, when scrolled to the top of a conversation. */
export async function loadOlder(userId: string) {
  const thread = state.threads[userId];
  if (!thread || thread.loading || !thread.more) return;
  const oldest = thread.messages[thread.messages.length - 1];
  updateThread(userId, (t) => ({ ...t, loading: true }));
  try {
    const page = await api.getMessages(userId, oldest?.createdAt);
    updateThread(userId, (t) => ({ messages: [...t.messages, ...page.messages], more: page.more, loading: false }));
  } catch {
    updateThread(userId, (t) => ({ ...t, loading: false }));
  }
}

export async function send(userId: string, content: { text?: string; title?: api.SharedTitle }) {
  received(await api.sendMessage(userId, content));
}

/** Sends a voice recording (a file on the phone) to a friend. */
export async function sendVoice(userId: string, fileUri: string, durationMs: number) {
  received(await uploadVoice(userId, fileUri, durationMs));
}

// ---- Friends ----

async function reloadFriends() {
  set({ friends: await api.getFriends() });
}

export async function addFriend(userId: string) {
  const out = await api.sendRequest(userId);
  await reloadFriends();
  return out.status;
}

export async function acceptFriend(requestId: string) {
  await api.acceptRequest(requestId);
  await reloadFriends();
}

export async function dropRequest(requestId: string) {
  await api.dropRequest(requestId);
  await reloadFriends();
}

export async function removeFriend(userId: string) {
  await api.unfriend(userId);
  await reloadFriends();
}
