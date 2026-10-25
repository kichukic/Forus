// The ForUs chat server (MytvstreamAppBackend): accounts, friends and
// messages. The sign-in token is kept in the device's secure storage. The
// server is hosted on Render; its address can be changed on the sign-in
// screen, e.g. to test against one run on a computer at home.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fetchWithTimeout } from '../api/http';
import type { Playable } from '../types';

// Accounts made with a phone number alone have no email.
export type ChatUser = { id: string; name: string; email?: string };
// `phone` is always a number Phone.Email verified; `hasPassword` is false for
// phone-only accounts.
export type Me = ChatUser & {
  emailVerified: boolean;
  phone?: string;
  hasPassword: boolean;
  isAdmin?: boolean;
  isadmin?: boolean;
  screenTimeSeconds?: number;
  lastActiveAt?: string;
};

// A ForUs film or episode shared in a chat.
export type SharedTitle =
  | { kind: 'video'; videoId: string; title: string }
  | { kind: 'web'; url: string; title: string; poster?: string }
  | { kind: 'stream'; url: string; title: string; poster?: string }
  | { kind: 'movie'; id: string; title: string; poster?: string; year?: string }
  | { kind: 'moviebox'; subjectId: string; season?: number; episode?: number; title: string; poster?: string }
  | { kind: 'file'; source: string; itemId: number; fileId: number; title: string };

export type ChatMessage = {
  id: string;
  sender: string;
  recipient: string;
  text?: string;
  title?: SharedTitle;
  // A voice message; its recording is kept on the phone (see voice.ts).
  voice?: { durationMs: number };
  createdAt: string;
  readAt?: string;
};

export type Conversation = { user: ChatUser; last: ChatMessage; unread: number };
export type FriendEntry = { requestId: string; user: ChatUser };
export type FriendLists = { friends: FriendEntry[]; incoming: FriendEntry[]; outgoing: FriendEntry[] };
export type Relation = 'none' | 'friends' | 'requested' | 'incoming';

const TOKEN_KEY = 'chat-token';
const SERVER_KEY = 'chat-server';
// The hosted server on Render. EXPO_PUBLIC_CHAT_SERVER overrides it at build
// time, e.g. http://<computer's Wi-Fi IP>:4000 for a server run at home.
export const DEFAULT_SERVER = process.env.EXPO_PUBLIC_CHAT_SERVER ?? 'https://mytvstreamappbackend.onrender.com';

let server = DEFAULT_SERVER;
let token: string | null = null;

/** Reads the saved server address and sign-in. True if signed in. */
export async function loadSession(): Promise<boolean> {
  server = (await AsyncStorage.getItem(SERVER_KEY).catch(() => null)) ?? DEFAULT_SERVER;
  token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return !!token;
}

export function serverAddress() {
  return server;
}

export function sessionToken() {
  return token;
}

export async function setServerAddress(address: string) {
  server = address.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  await AsyncStorage.setItem(SERVER_KEY, server);
}

async function saveToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

/** A problem the server explained, with its message for the person. */
export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, timeoutMs = 10000): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      server + path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      timeoutMs,
    );
  } catch {
    throw new ChatError(0, "Can't reach the chat server. Check the connection.");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ChatError(res.status, data?.error ?? 'Something went wrong.');
  return data as T;
}

export async function signIn(email: string, password: string) {
  const out = await call<{ token: string; user: Me }>('POST', '/auth/login', { email, password });
  await saveToken(out.token);
  return out.user;
}

export async function signOut() {
  await saveToken(null);
}

export type VerifiedSignIn = { isNew: false; user: Me } | { isNew: true; ticket: string; suggestedName?: string };

/**
 * Signs in with what Phone.Email's verification page returned: an access
 * token for a phone, a result link for an email. Something new comes back
 * with a ticket for `signUp`, to make the account.
 */
async function verifiedLogin(path: string, body: object): Promise<VerifiedSignIn> {
  const out = await call<
    { isNew: false; token: string; user: Me } | { isNew: true; ticket: string; suggestedName?: string }
  >('POST', path, body);
  if (!out.isNew) {
    await saveToken(out.token);
    return { isNew: false, user: out.user };
  }
  return out;
}

export const phoneLogin = (accessToken: string) => verifiedLogin('/auth/phone', { accessToken });
export const emailLogin = (resultUrl: string) => verifiedLogin('/auth/email', { resultUrl });

export async function signUp(ticket: string, name: string) {
  const out = await call<{ token: string; user: Me }>('POST', '/auth/signup', { ticket, name });
  await saveToken(out.token);
  return out.user;
}

export const getMe = () => call<{ user: Me }>('GET', '/me').then((r) => r.user);
export const updateName = (name: string) => call<{ user: Me }>('PATCH', '/me', { name }).then((r) => r.user);
/** Adds or changes your number, with the token from Phone.Email's page. */
export const verifyPhone = (accessToken: string) =>
  call<{ user: Me }>('POST', '/me/phone', { accessToken }).then((r) => r.user);
export const removePhone = () => call<{ user: Me }>('DELETE', '/me/phone').then((r) => r.user);
/** Adds, changes or confirms your email, with the result link from Phone.Email's page. */
export const verifyEmail = (resultUrl: string) =>
  call<{ user: Me }>('POST', '/me/email', { resultUrl }).then((r) => r.user);
export const removeEmail = () => call<{ user: Me }>('DELETE', '/me/email').then((r) => r.user);

/** Someone by exact email or phone number. */
export function lookUp(query: string) {
  const q = query.trim();
  const param = q.includes('@') ? `email=${encodeURIComponent(q)}` : `phone=${encodeURIComponent(q)}`;
  return call<{ user: ChatUser; status: Relation }>('GET', `/users/lookup?${param}`);
}

export const getFriends = () => call<FriendLists>('GET', '/friends');

// Which of the phone's contacts are on ForUs. The numbers and emails are
// matched against verified ones and not kept by the server.
export type ContactMatch = { user: ChatUser; status: Relation; matched: string };
export const matchContacts = (phones: string[], emails: string[]) =>
  call<{ matches: ContactMatch[] }>('POST', '/contacts/match', { phones, emails }).then((r) => r.matches);
export const sendRequest = (userId: string) =>
  call<{ status: Relation; requestId?: string }>('POST', '/friends/requests', { userId });
export const acceptRequest = (requestId: string) => call<unknown>('POST', `/friends/requests/${requestId}/accept`);
export const dropRequest = (requestId: string) => call<unknown>('DELETE', `/friends/requests/${requestId}`);
export const unfriend = (userId: string) => call<unknown>('DELETE', `/friends/${userId}`);

export const getConversations = () =>
  call<{ conversations: Conversation[] }>('GET', '/conversations').then((r) => r.conversations);

export const getMessages = (userId: string, before?: string) =>
  call<{ messages: ChatMessage[]; more: boolean }>(
    'GET',
    `/conversations/${userId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
  );

export const sendMessage = (userId: string, content: { text?: string; title?: SharedTitle }) =>
  call<{ message: ChatMessage }>('POST', `/conversations/${userId}/messages`, content).then((r) => r.message);

export const markRead = (userId: string) => call<unknown>('POST', `/conversations/${userId}/read`);

// Watch history kept with the account. Times are ISO strings on the wire.
export type RemoteHistoryEntry = { item: Playable; watchedAt: string };
export const mergeHistory = (entries: RemoteHistoryEntry[]) =>
  call<{ entries: RemoteHistoryEntry[] }>('POST', '/history', { entries }).then((r) => r.entries);
export const clearRemoteHistory = () => call<unknown>('DELETE', '/history');

// AI Vibe & Mood Search via backend Gemini proxy
export type AiVibeResult = { title: string; year?: number; reason?: string };
// A Gemini call is slower than the chat endpoints, so it gets its own budget.
export const aiVibeSearch = (prompt: string) =>
  call<{ results: AiVibeResult[] }>('POST', '/ai/search', { prompt }, 30000).then((r) => r.results);

// Admin Analytics
export type AdminUserAnalytics = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isAdmin: boolean;
  online: boolean;
  currentSessionSeconds: number;
  totalScreenTimeSeconds: number;
  lastActiveAt: string;
  joinedAt: string;
};

export type AdminAnalyticsData = {
  onlineCount: number;
  totalUsers: number;
  totalScreenTimeSeconds: number;
  onlineUsers: AdminUserAnalytics[];
  users: AdminUserAnalytics[];
};

export const getAdminAnalytics = () =>
  call<AdminAnalyticsData>('GET', '/admin/analytics', undefined, 15000);

export const recordScreenTimeHeartbeat = (seconds = 30) =>
  call<{ ok: boolean }>('POST', '/analytics/heartbeat', { seconds }).catch(() => ({ ok: false }));

// Blocked Banners
export type BlockedBannerItem = {
  videoId: string;
  title?: string;
  channel?: string;
  blockedByName?: string;
  createdAt: string;
};

export const fetchGloballyBlockedBanners = () =>
  call<{ ok: boolean; blockedVideoIds: string[]; items: BlockedBannerItem[] }>(
    'GET',
    '/banners/blocked',
    undefined,
    10000,
  ).catch(() => ({ ok: false, blockedVideoIds: [], items: [] }));

export const blockBannerGloballyApi = (data: { videoId: string; title?: string; channel?: string }) =>
  call<{ ok: boolean; item: BlockedBannerItem }>('POST', '/admin/banners/block', data);

export const unblockBannerGloballyApi = (videoId: string) =>
  call<{ ok: boolean }>('DELETE', `/admin/banners/block/${encodeURIComponent(videoId)}`);

export const getAdminBlockedBanners = () =>
  call<{ ok: boolean; items: BlockedBannerItem[] }>('GET', '/admin/banners/blocked', undefined, 10000);

