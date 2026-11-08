// Voice messages live on the phones. A recording is uploaded once; the chat
// server holds it only until the friend's phone has downloaded it (and is told
// so), then deletes it. Each phone keeps its own copy here, under the app's
// documents, named after the message. A phone that's been reinstalled has no
// copy: those show as unavailable, like on WhatsApp.
import * as FileSystem from 'expo-file-system/legacy';
import { RecordingPresets, type RecordingOptions } from 'expo-audio';
import { ChatError, serverAddress, sessionToken, type ChatMessage } from './api';

const DIR = `${FileSystem.documentDirectory}voice/`;
const MIME = 'audio/mp4';

// Voice quality: mono AAC at 32 kbps, about 240 KB a minute. The server takes
// up to 3 MB, roughly twelve minutes.
export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
};
export const MAX_VOICE_MS = 10 * 60 * 1000;

let dirReady: Promise<void> | null = null;
function ensureDir() {
  dirReady ??= FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  return dirReady;
}

export function voiceFile(messageId: string) {
  return `${DIR}${messageId}.m4a`;
}

export async function hasVoiceFile(messageId: string): Promise<boolean> {
  return (await FileSystem.getInfoAsync(voiceFile(messageId))).exists;
}

export async function removeLocalFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

function authHeaders(): Record<string, string> {
  const token = sessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Sends a recording to a friend; it's kept here under the new message's id. */
export async function uploadVoice(userId: string, fileUri: string, durationMs: number): Promise<ChatMessage> {
  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await FileSystem.uploadAsync(
      `${serverAddress()}/conversations/${userId}/voice?durationMs=${Math.round(durationMs)}`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { ...authHeaders(), 'Content-Type': MIME },
      },
    );
  } catch {
    throw new ChatError(0, "Can't reach the chat server. Check the connection.");
  }
  const data = (() => {
    try {
      return JSON.parse(result.body);
    } catch {
      return null;
    }
  })();
  if (result.status !== 201 || !data?.message) {
    throw new ChatError(result.status, data?.error ?? "That voice message couldn't be sent.");
  }
  const message = data.message as ChatMessage;
  await ensureDir();
  await FileSystem.moveAsync({ from: fileUri, to: voiceFile(message.id) }).catch(() => {});
  return message;
}

// Downloads in flight, so two bubbles for the same message share one.
const fetching = new Map<string, Promise<boolean>>();

/**
 * Collects a friend's voice message from the server and tells it to let go.
 * False if the server no longer has it (already collected elsewhere, or old).
 */
export function fetchVoice(messageId: string): Promise<boolean> {
  let job = fetching.get(messageId);
  if (!job) {
    job = (async () => {
      await ensureDir();
      const target = voiceFile(messageId);
      const partial = `${target}.part`;
      try {
        const result = await FileSystem.downloadAsync(`${serverAddress()}/voice/${messageId}`, partial, {
          headers: authHeaders(),
        });
        if (result.status !== 200) {
          await FileSystem.deleteAsync(partial, { idempotent: true });
          return false;
        }
        await FileSystem.moveAsync({ from: partial, to: target });
        // Saved; the server can delete its copy now.
        await fetch(`${serverAddress()}/voice/${messageId}`, { method: 'DELETE', headers: authHeaders() }).catch(
          () => {},
        );
        return true;
      } catch {
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        return false;
      }
    })().finally(() => fetching.delete(messageId));
    fetching.set(messageId, job);
  }
  return job;
}

/** "0:42", "12:05". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
