// The chat's state, shared by every chat screen and the bottom bar's unread
// badge: who is signed in, the conversation list, friends and requests, and
// the messages of each open conversation. The connection stays open while the
// app is in the background too (the Android keep-alive service holds the
// process), so new messages and friend activity arrive at once.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { loadKeepAlivePreference, startKeepAlive, stopKeepAlive } from './background';
import { setupMessageNotifications, notifyIncomingMessage } from './push';
import * as api from './api';
import { uploadVoice } from './voice';
import type {
  ChatMessage,
  ChatUser,
  Conversation,
  FriendLists,
  FriendWatching,
  Me,
  WatchingTitle,
} from './api';
import type { Playable } from '../types';

type Thread = { messages: ChatMessage[]; more: boolean; loading: boolean };

export type ChatState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  conversations: Conversation[] | null;
  friends: FriendLists | null;
  threads: Record<string, Thread>;
  // Friends whose app is connected, and what they are playing right now.
  onlineFriendIds: string[];
  watching: FriendWatching[];
  // Whether the live connection is up.
  live: boolean;
};

let state: ChatState = {
  status: 'loading',
  me: null,
  conversations: null,
  friends: null,
  threads: {},
  onlineFriendIds: [],
  watching: [],
  live: false,
};
const listeners = new Set<() => void>();
let socket: Socket | null = null;
// The conversation on screen; its new messages are marked read straight away.
let openWith: string | null = null;
// Whether the app is on screen. A conversation left open when the app goes to
// the background is no longer being read, so those messages still notify.
let foreground = AppState.currentState === 'active';
// The playback last sent to the server, so a reconnect can announce it again.
let currentWatching: WatchingTitle | null = null;
let currentWatchingKey = '';
// The newest watching event seen for each friend. Socket updates are
// asynchronous, so a start that finishes broadcasting after its stop must not
// bring a card back.
const watchingEventAt = new Map<string, number>();

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

/** The friends whose app is connected right now. */
export function useOnlineFriendIds(): string[] {
  return useSyncExternalStore(subscribe, () => state.onlineFriendIds);
}

/** What each friend is playing right now, newest first. */
export function useFriendsWatching(): FriendWatching[] {
  return useSyncExternalStore(subscribe, () => state.watching);
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
  await loadKeepAlivePreference();
  AppState.addEventListener('change', (s) => {
    foreground = s === 'active';
    if (state.status !== 'signedIn') return;
    if (s === 'active') {
      // Back on screen: make sure the connection is up (Android may have
      // stopped the service) and pick up whatever arrived in the meantime.
      startKeepAlive();
      connect();
      refresh();
      // Messages that came in for the conversation still on screen were left
      // unread while the app was away; they have been read now.
      if (openWith) {
        setUnread(openWith, 0);
        api.markRead(openWith).catch(() => {});
      }
    }
    // Going to the background needs nothing: the keep-alive service (started
    // while the app was visible) holds the process, and with it the socket,
    // so messages keep arriving and still raise their notifications.
  });
  if (!(await api.loadSession())) return set({ status: 'signedOut' });
  try {
    const me = await api.getMe();
    set({ me, status: 'signedIn' });
  } catch (e) {
    // An expired sign-in; anything else (offline) keeps the session for later.
    if (e instanceof api.ChatError && e.status === 401) {
      await signOut();
      return;
    }
    set({ status: 'signedIn' });
  }
  connect();
  refresh();
  startKeepAlive();
  setupMessageNotifications();
}

async function signedIn(me: Me) {
  set({
    me,
    status: 'signedIn',
    conversations: null,
    friends: null,
    threads: {},
    onlineFriendIds: [],
    watching: [],
  });
  connect();
  refresh();
  startKeepAlive();
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
  stopKeepAlive();
  currentWatching = null;
  currentWatchingKey = '';
  watchingEventAt.clear();
  await api.signOut();
  set({
    status: 'signedOut',
    me: null,
    conversations: null,
    friends: null,
    threads: {},
    onlineFriendIds: [],
    watching: [],
  });
}

export async function updateName(name: string) {
  set({ me: await api.updateName(name) });
}

/** Saves a new profile picture (a data URI), or removes it with null. */
export async function changeAvatar(avatar: string | null) {
  set({ me: await api.updateAvatar(avatar) });
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
  if (!state.me) {
    void api.getMe().then((me) => set({ me })).catch(() => {});
  }
  const [conversations, friends] = await Promise.all([
    api.getConversations().catch(() => state.conversations),
    api.getFriends().catch(() => state.friends),
  ]);
  setFriends(friends);
  set({ conversations });
  requestSocial();
}

/** Keeps presence and watching to people who are still friends. */
function setFriends(friends: FriendLists | null) {
  if (!friends) {
    set({ friends });
    return;
  }
  const ids = new Set(friends.friends.map((entry) => entry.user.id));
  set({
    friends,
    onlineFriendIds: state.onlineFriendIds.filter((id) => ids.has(id)),
    watching: state.watching.filter((entry) => ids.has(entry.user.id)),
  });
}

// ---- Live connection ----

function connect() {
  if (socket || !api.sessionToken()) return;
  socket = io(api.serverAddress(), {
    auth: { token: api.sessionToken() },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  });
  socket.on('connect', () => {
    set({ live: true });
    // A player may already be open (for example after the connection dropped
    // while a film was playing): announce it again.
    if (currentWatching) socket?.emit('watching:update', currentWatching);
    requestSocial();
    refresh();
  });
  socket.on('disconnect', () => set({ live: false }));
  socket.on('connect_error', (err) => {
    set({ live: false });
    if (err?.message === 'unauthorized') {
      void signOut();
    }
  });
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

  // Friends' presence and playback. A server that predates these events simply
  // never sends them, and the rows stay hidden.
  socket.on('presence', receivedPresence);
  socket.on('presence:list', receivedPresenceList);
  socket.on('watching', receivedWatching);
  socket.on('watching:stop', receivedWatchingStop);
  socket.on('watching:list', receivedWatchingList);

  const reload = () => {
    api
      .getFriends()
      .then((friends) => {
        setFriends(friends);
        requestSocial();
      })
      .catch(() => {});
  };
  socket.on('friend-request', reload);
  socket.on('friend-accepted', reload);
  socket.on('friend-removed', (event: { userId?: unknown }) => {
    if (typeof event?.userId === 'string') {
      const userId = event.userId;
      watchingEventAt.delete(userId);
      set({
        onlineFriendIds: state.onlineFriendIds.filter((id) => id !== userId),
        watching: state.watching.filter((entry) => entry.user.id !== userId),
      });
    }
    reload();
  });
}

function requestSocial() {
  if (!socket?.connected) return;
  socket.emit('presence:list');
  socket.emit('watching:list');
}

function receivedPresence(event: unknown) {
  if (!event || typeof event !== 'object') return;
  const { userId, online } = event as { userId?: unknown; online?: unknown };
  if (typeof userId !== 'string') return;
  if (online === true) {
    if (!state.onlineFriendIds.includes(userId)) {
      set({ onlineFriendIds: [...state.onlineFriendIds, userId] });
    }
  } else if (online === false) {
    set({ onlineFriendIds: state.onlineFriendIds.filter((id) => id !== userId) });
  }
}

function receivedPresenceList(event: unknown) {
  if (!event || typeof event !== 'object') return;
  const { online } = event as { online?: unknown };
  if (!Array.isArray(online)) return;
  const ids = online.filter((id): id is string => typeof id === 'string');
  set({ onlineFriendIds: [...new Set(ids)] });
}

const WATCHING_KINDS = new Set(['video', 'live', 'file', 'stream', 'web', 'moviebox']);

/** Checks a payload enough that a broken or old server can't crash a card. */
function asFriendsWatching(value: unknown): FriendWatching | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as { user?: unknown; watching?: unknown; at?: unknown };
  if (!entry.user || typeof entry.user !== 'object') return null;
  const user = entry.user as Partial<ChatUser>;
  if (typeof user.id !== 'string' || typeof user.name !== 'string') return null;
  if (!entry.watching || typeof entry.watching !== 'object') return null;
  const watching = entry.watching as Partial<WatchingTitle> & { kind?: unknown };
  if (typeof watching.title !== 'string' || !WATCHING_KINDS.has(String(watching.kind))) return null;
  const eventAt = typeof entry.at === 'string' ? Date.parse(entry.at) : Date.now();
  const at = new Date(Number.isFinite(eventAt) ? eventAt : Date.now()).toISOString();
  return {
    user: { id: user.id, name: user.name, email: typeof user.email === 'string' ? user.email : undefined },
    watching: watching as WatchingTitle,
    at,
  };
}

function receivedWatching(event: unknown) {
  const entry = asFriendsWatching(event);
  if (!entry) return;
  const at = Date.parse(entry.at);
  if (at < (watchingEventAt.get(entry.user.id) ?? 0)) return;
  watchingEventAt.set(entry.user.id, at);
  set({ watching: [entry, ...state.watching.filter((item) => item.user.id !== entry.user.id)].slice(0, 30) });
}

function receivedWatchingStop(event: unknown) {
  if (!event || typeof event !== 'object') return;
  const { userId, at: rawAt } = event as { userId?: unknown; at?: unknown };
  if (typeof userId !== 'string') return;
  const at = typeof rawAt === 'string' ? Date.parse(rawAt) : Date.now();
  const stamp = Number.isFinite(at) ? at : Date.now();
  if (stamp < (watchingEventAt.get(userId) ?? 0)) return;
  watchingEventAt.set(userId, stamp);
  set({ watching: state.watching.filter((entry) => entry.user.id !== userId) });
}

function receivedWatchingList(event: unknown) {
  if (!event || typeof event !== 'object') return;
  const { items, at: snapshotAt } = event as { items?: unknown; at?: unknown };
  if (!Array.isArray(items)) return;
  // When the server made this list. A start received after it is newer than
  // anything in the list, even if it is not listed yet.
  const snapshot = typeof snapshotAt === 'string' ? Date.parse(snapshotAt) : Date.now();
  const listed = new Map<string, FriendWatching>();
  for (const item of items) {
    const entry = asFriendsWatching(item);
    if (!entry) continue;
    const at = Date.parse(entry.at);
    // A newer event for this friend already changed the answer.
    if (at < (watchingEventAt.get(entry.user.id) ?? 0)) continue;
    const existing = listed.get(entry.user.id);
    if (!existing || Date.parse(existing.at) < at) listed.set(entry.user.id, entry);
  }
  // A card whose start arrived after the list was made is still current; the
  // rest that are missing from the list have stopped.
  for (const entry of state.watching) {
    if (!listed.has(entry.user.id) && Date.parse(entry.at) > snapshot) listed.set(entry.user.id, entry);
  }
  const watching = [...listed.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  // Existing stamps are kept: they also remember stops, so an old start
  // cannot undo one.
  for (const entry of watching) {
    const at = Date.parse(entry.at);
    if (Number.isFinite(at) && at > (watchingEventAt.get(entry.user.id) ?? 0)) watchingEventAt.set(entry.user.id, at);
  }
  set({ watching });
}

function disconnect() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  set({ live: false });
}

/** Sends what this phone is playing to the server, so friends can see it. */
export function publishWatching(item: Playable | null) {
  const next = item ? watchingFrom(item) : null;
  const key = next ? JSON.stringify(next) : '';
  if (key === currentWatchingKey) return;
  currentWatching = next;
  currentWatchingKey = key;
  if (!socket?.connected) return;
  if (next) socket.emit('watching:update', next);
  else socket.emit('watching:stop');
}

function watchingFrom(item: Playable): WatchingTitle {
  switch (item.kind) {
    case 'video':
      return { kind: 'video', videoId: item.videoId, title: item.title };
    case 'live':
      return { kind: 'live', channelId: item.channelId, title: item.title };
    case 'file':
      return {
        kind: 'file',
        source: item.source,
        itemId: item.itemId,
        fileId: item.fileId,
        title: item.title,
      };
    case 'stream':
      return { kind: 'stream', url: item.url, title: item.title, poster: item.poster };
    case 'web':
      return { kind: 'web', url: item.url, title: item.title, poster: item.poster };
    case 'moviebox':
      return {
        kind: 'moviebox',
        subjectId: item.subjectId,
        season: item.season,
        episode: item.episode,
        title: item.title,
        poster: item.poster,
      };
  }
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

  const open = foreground && otherId === openWith;
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
  setFriends(await api.getFriends());
  requestSocial();
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
