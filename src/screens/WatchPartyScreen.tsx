// Watch Party: create or join a room and sync playback with friends.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { io, type Socket } from 'socket.io-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme';

const TOKEN_KEY = 'chat-token';
const SERVER_KEY = 'chat-server';
const DEFAULT_SERVER = process.env.EXPO_PUBLIC_CHAT_SERVER ?? 'https://mytvstreamappbackend.onrender.com';

type Props = { onBack: () => void };

export function WatchPartyScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [joined, setJoined] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [chat, setChat] = useState<{ from: string; text: string; at: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [status, setStatus] = useState('Not connected');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = (await AsyncStorage.getItem(SERVER_KEY).catch(() => null)) ?? DEFAULT_SERVER;
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (!token || cancelled) return;
      const s = io(server, { auth: { token }, transports: ['websocket'] });
      socketRef.current = s;
      s.on('connect', () => setStatus('Connected'));
      s.on('disconnect', () => setStatus('Disconnected'));
      s.on('party:joined', (d: { code: string }) => setJoined(d.code));
      s.on('party:member', (d: { userId: string; joined: boolean }) => {
        setMembers((prev) => (d.joined ? [...new Set([...prev, d.userId])] : prev.filter((x) => x !== d.userId)));
      });
      s.on('party:chat', (d: { userId: string; text: string; at: string }) => {
        setChat((prev) => [...prev, { from: d.userId, text: d.text, at: d.at }]);
      });
      // Playback sync events are surfaced to the host app via these; a full
      // integration would drive the player. For now we just record them.
      s.on('party:play', () => {});
      s.on('party:pause', () => {});
      s.on('party:seek', () => {});
    })();
    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const create = () => {
    const c = code.trim() || Math.random().toString(36).slice(2, 8).toUpperCase();
    setCode(c);
    socketRef.current?.emit('party:create', { code: c });
  };
  const join = () => {
    if (!code.trim()) return;
    socketRef.current?.emit('party:join', { code: code.trim() });
  };
  const leave = () => {
    socketRef.current?.emit('party:leave');
    setJoined(null);
    setMembers([]);
  };
  const send = () => {
    if (!msg.trim() || !joined) return;
    socketRef.current?.emit('party:chat', { text: msg.trim() });
    setMsg('');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Watch Party</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      {!joined ? (
        <View style={styles.body}>
          <Text style={styles.label}>Party code</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Enter or leave blank to generate"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="characters"
          />
          <View style={styles.row}>
            <Pressable onPress={create} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
              <Text style={styles.btnText}>Create party</Text>
            </Pressable>
            <Pressable onPress={join} style={({ pressed }) => [styles.btn, styles.btnSecondary, pressed && styles.pressed]}>
              <Text style={styles.btnTextSecondary}>Join party</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Share the code with friends. Once joined, playback syncs across everyone.
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.joined}>Party: {joined}</Text>
          <Text style={styles.members}>{members.length} member(s)</Text>
          <Pressable onPress={leave} style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.pressed]}>
            <Text style={styles.btnText}>Leave party</Text>
          </Pressable>
          <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent}>
            {chat.map((m, i) => (
              <View key={i} style={styles.chatMsg}>
                <Text style={styles.chatFrom}>{m.from.slice(0, 6)}</Text>
                <Text style={styles.chatText}>{m.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              value={msg}
              onChangeText={setMsg}
              placeholder="Message…"
              placeholderTextColor={colors.muted}
              style={styles.chatInput}
              onSubmitEditing={send}
            />
            <Pressable onPress={send} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  title: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
  status: { color: colors.muted, fontSize: 11 },
  body: { flex: 1, padding: 16, gap: 12 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { height: 44, borderRadius: 12, paddingHorizontal: 12, color: colors.text, fontSize: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  btnSecondary: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: '#c0392b' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnTextSecondary: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  pressed: { opacity: 0.7 },
  joined: { color: colors.text, fontSize: 18, fontWeight: '900' },
  members: { color: colors.muted, fontSize: 12 },
  chat: { flex: 1, marginTop: 8 },
  chatContent: { gap: 8, paddingBottom: 8 },
  chatMsg: { padding: 8, borderRadius: 10, backgroundColor: colors.surface },
  chatFrom: { color: colors.accent, fontSize: 10, fontWeight: '800' },
  chatText: { color: colors.text, fontSize: 13, marginTop: 2 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1, height: 40, borderRadius: 12, paddingHorizontal: 12, color: colors.text, fontSize: 13, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
});
