import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {
  disconnectTrakt,
  getTraktSession,
  pollDeviceToken,
  requestDeviceCode,
  setAutoScrobble,
  type DeviceCodeResponse,
  type TraktSession,
} from '../api/trakt';
import { showToast } from '../data/toasts';
import { colors, isTV } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function TraktSetupScreen({ visible, onClose }: Props) {
  const [session, setSession] = useState<TraktSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [autoScrobble, setAutoScrobbleState] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAuth = async () => {
    setLoading(true);
    try {
      const code = await requestDeviceCode();
      setDeviceCode(code);
      poll(code);
    } catch (e) {
      showToast({ text: (e as Error).message || 'Failed to start Trakt login' });
    } finally {
      setLoading(false);
    }
  };

  const poll = (code: DeviceCodeResponse) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const s = await pollDeviceToken(code.device_code);
        if (s) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setSession(s);
          setDeviceCode(null);
        }
      } catch {
        // Pending authorization, continue polling
      }
    }, (code.interval || 5) * 1000);
  };

  useEffect(() => {
    let active = true;
    if (visible) {
      getTraktSession().then((s) => {
        if (!active) return;
        setSession(s);
        if (!s) {
          startAuth();
        }
      });
    } else {
      if (pollTimer.current) clearInterval(pollTimer.current);
    }
    return () => {
      active = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [visible]);

  const handleCopy = async () => {
    if (!deviceCode) return;
    await Clipboard.setStringAsync(deviceCode.user_code);
    showToast({ text: 'Code copied to clipboard' });
  };

  const handleDisconnect = async () => {
    await disconnectTrakt();
    setSession(null);
    startAuth();
  };

  const handleToggleScrobble = (val: boolean) => {
    setAutoScrobbleState(val);
    setAutoScrobble(val);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="film" size={24} color="#ed1c24" />
              <Text style={styles.headerTitle}>Trakt.tv Sync</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {session ? (
            <View style={styles.content}>
              <View style={styles.userBox}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={28} color="#fff" />
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{session.name || session.username}</Text>
                  <Text style={styles.userHandle}>@{session.username}</Text>
                </View>
                <View style={styles.connectedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Automatic Scrobbling</Text>
                  <Text style={styles.settingSub}>
                    Mark movies and episodes as watched when reaching ≥80%
                  </Text>
                </View>
                <Switch
                  value={autoScrobble}
                  onValueChange={handleToggleScrobble}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accent }}
                  thumbColor="#fff"
                />
              </View>

              <Pressable
                onPress={handleDisconnect}
                style={({ pressed }) => [styles.disconnectBtn, pressed && styles.btnPressed]}
              >
                <Ionicons name="log-out-outline" size={18} color="#f87171" />
                <Text style={styles.disconnectText}>Disconnect Trakt</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.content}>
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingText}>Contacting Trakt.tv…</Text>
                </View>
              ) : deviceCode ? (
                <View style={styles.authBox}>
                  <Text style={styles.stepTitle}>1. Open in your browser:</Text>
                  <Text style={styles.urlText}>https://trakt.tv/activate</Text>

                  <Text style={styles.stepTitle}>2. Enter this code:</Text>
                  <Pressable onPress={handleCopy} style={styles.codeBox}>
                    <Text style={styles.codeText}>{deviceCode.user_code}</Text>
                    <Ionicons name="copy-outline" size={20} color={colors.accent} />
                  </Pressable>
                  <Text style={styles.tapToCopy}>Tap code to copy</Text>

                  <View style={styles.pollingStatus}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.pollingText}>Waiting for authorization…</Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    color: colors.text,
    fontSize: isTV ? 20 : 17,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  userBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ed1c24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  userHandle: {
    color: colors.muted,
    fontSize: 13,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74,222,128,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  connectedText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  settingInfo: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    marginTop: 6,
  },
  disconnectText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
  },
  authBox: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  stepTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  urlText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.accent,
    marginTop: 4,
  },
  codeText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 3,
  },
  tapToCopy: {
    color: colors.muted,
    fontSize: 11,
  },
  pollingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  pollingText: {
    color: colors.muted,
    fontSize: 12,
  },
  btnPressed: {
    opacity: 0.6,
  },
});
