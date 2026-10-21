// The pop-up that offers a new version: what's new, how big it is, and an
// Update now button that downloads it right here, with its progress, before
// handing it to Android's installer. Everything animates on the native side
// and there is no blur, so it stays light on a slow phone or TV.
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  downloadUpdate,
  installUpdate,
  installedVersionName,
  openInstallUnknownAppsSettings,
  type Update,
} from '../api/updates';
import { colors, isTV, sz } from '../theme';

type Props = {
  // The update to offer; null hides the pop-up.
  update: Update | null;
  onClose: () => void;
};

type Phase = 'offer' | 'downloading' | 'installing' | 'error';

const ICON = require('../../assets/images/icon.png');
const MB = 1024 * 1024;

export function UpdatePrompt({ update, onClose }: Props) {
  // The last update shown, so the card keeps its text while it animates away.
  const [shown, setShown] = useState<Update | null>(update);
  const [phase, setPhase] = useState<Phase>('offer');
  const [bytes, setBytes] = useState({ written: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const [appear] = useState(() => new Animated.Value(0));
  const [halo] = useState(() => new Animated.Value(0));
  const [fill] = useState(() => new Animated.Value(0));

  // A newly offered update starts the card afresh.
  const [offered, setOffered] = useState<Update | null>(null);
  if (update && update !== offered) {
    setOffered(update);
    setShown(update);
    setPhase('offer');
    setError(null);
    setBytes({ written: 0, total: 0 });
  }

  useEffect(() => {
    if (!update) return;
    fill.setValue(0);
    appear.setValue(0);
    Animated.spring(appear, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 7 }).start();
  }, [update, appear, fill]);

  // The glow behind the icon breathes while the card is waiting for an answer.
  useEffect(() => {
    if (!update || phase !== 'offer') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [update, phase]);

  const close = () => {
    Animated.timing(appear, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
      () => onClose(),
    );
  };

  const start = async () => {
    if (!shown) return;
    setPhase('downloading');
    setError(null);
    fill.setValue(0);
    try {
      const uri = await downloadUpdate(shown, (written, total) => {
        setBytes({ written, total });
        if (total > 0) {
          Animated.timing(fill, { toValue: written / total, duration: 220, useNativeDriver: true }).start();
        }
      });
      setPhase('installing');
      await installUpdate(uri);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setPhase('error');
    }
  };

  if (!shown) return null;

  const total = bytes.total || shown.size || 0;
  const share = total ? Math.min(1, bytes.written / total) : 0;
  const notes = (shown.notes ?? '')
    // One point per line of the release notes.
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
  const busy = phase === 'downloading' || phase === 'installing';

  return (
    <Modal visible={!!update} transparent animationType="none" onRequestClose={busy ? () => {} : close}>
      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill}>
        {!busy && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
        <BlurView intensity={25} tint="dark" style={styles.cardBlur}>
          <Animated.View
            style={[
              styles.cardInner,
              {
                opacity: appear,
                transform: [
                  { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                  { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                ],
              },
            ]}
          >
          {/* The banner: the app's icon on a breathing glow. */}
          <LinearGradient colors={[colors.accent, colors.accentDeep, '#2a1458']} style={styles.banner}>
            <Animated.View
              style={[
                styles.halo,
                {
                  opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }),
                  transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] }) }],
                },
              ]}
            />
            <Image source={ICON} style={styles.icon} />
            <View style={styles.chip}>
              <Ionicons name="sparkles" size={sz(11, 13)} color="#fff" />
              <Text style={styles.chipText}>NEW UPDATE</Text>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.title}>ForUs {shown.version}</Text>
            <View style={styles.versions}>
              <Text style={styles.versionOld}>{installedVersionName()}</Text>
              <Ionicons name="arrow-forward" size={sz(13, 15)} color={colors.muted} />
              <Text style={styles.versionNew}>{shown.version}</Text>
              {shown.size ? <Text style={styles.size}>· {Math.round(shown.size / MB)} MB</Text> : null}
            </View>

            {phase === 'offer' && notes.length > 0 && (
              <View style={styles.notes}>
                <Text style={styles.notesHeading}>What&apos;s new</Text>
                {notes.map((line, i) => (
                  <View key={i} style={styles.noteRow}>
                    <Ionicons name="checkmark-circle" size={sz(15, 18)} color={colors.accent} />
                    <Text style={styles.noteText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}

            {phase === 'downloading' && (
              <View style={styles.progressBlock}>
                <View style={styles.progressText}>
                  <Text style={styles.progressLabel}>Downloading</Text>
                  <Text style={styles.progressValue}>{Math.round(share * 100)}%</Text>
                </View>
                <View style={styles.track}>
                  <Animated.View style={[styles.fill, { transform: [{ scaleX: fill }] }]}>
                    <LinearGradient
                      colors={['#b98aff', colors.accent, colors.accentDeep]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                </View>
                {total ? (
                  <Text style={styles.hint}>
                    {(bytes.written / MB).toFixed(1)} of {(total / MB).toFixed(0)} MB
                  </Text>
                ) : null}
              </View>
            )}

            {phase === 'installing' && (
              <View style={styles.progressBlock}>
                <View style={styles.noteRow}>
                  <Ionicons name="checkmark-circle" size={sz(18, 22)} color={colors.accent} />
                  <Text style={styles.progressLabel}>Downloaded. Opening the installer…</Text>
                </View>
                <Text style={styles.hint}>If Android asks, allow ForUs to install apps, then tap Install.</Text>
              </View>
            )}

            {phase === 'error' && (
              <View style={styles.progressBlock}>
                <View style={styles.noteRow}>
                  <Ionicons name="alert-circle" size={sz(18, 22)} color={colors.live} />
                  <Text style={styles.errorText}>The download didn&apos;t finish.</Text>
                </View>
                {error ? (
                  <Text style={styles.hint} numberOfLines={2}>
                    {error}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.buttons}>
              {phase === 'installing' ? (
                <>
                  <Button label="Allow installs" icon="shield-checkmark-outline" onPress={openInstallUnknownAppsSettings} />
                  <Button label="Done" onPress={close} primary preferredFocus />
                </>
              ) : phase === 'downloading' ? null : (
                <>
                  <Button label="Later" onPress={close} />
                  <Button
                    label={phase === 'error' ? 'Try again' : 'Update now'}
                    icon={phase === 'error' ? 'refresh' : 'cloud-download-outline'}
                    onPress={start}
                    primary
                    preferredFocus
                  />
                </>
              )}
            </View>
          </View>
          </Animated.View>
        </BlurView>
      </BlurView>
    </Modal>
  );
}

function Button({
  label,
  icon,
  onPress,
  primary,
  preferredFocus,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
  preferredFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const content = (
    <>
      {icon ? <Ionicons name={icon} size={sz(17, 20)} color="#fff" /> : null}
      <Text style={[styles.buttonText, !primary && styles.buttonTextQuiet]}>{label}</Text>
    </>
  );
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={isTV && preferredFocus}
      style={({ pressed }) => [
        styles.button,
        !primary && styles.buttonQuiet,
        focused && styles.buttonFocused,
        pressed && styles.buttonPressed,
      ]}
    >
      {primary ? (
        <LinearGradient
          colors={['#b98aff', colors.accent, colors.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonInner}
        >
          {content}
        </LinearGradient>
      ) : (
        <View style={styles.buttonInner}>{content}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,4,12,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cardBlur: {
    width: '100%',
    maxWidth: isTV ? 560 : 420,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#9b5cff',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 16,
  },
  cardInner: {
    backgroundColor: 'rgba(20,18,30,0.35)',
    padding: sz(22, 28),
  },
  banner: {
    height: sz(150, 170),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(155,92,255,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  halo: {
    position: 'absolute',
    width: sz(150, 180),
    height: sz(150, 180),
    borderRadius: sz(75, 90),
    backgroundColor: '#fff',
  },
  icon: { width: sz(84, 100), height: sz(84, 100), borderRadius: sz(22, 26) },
  chip: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  chipText: { color: '#fff', fontSize: sz(10.5, 12), fontWeight: '900', letterSpacing: 1 },
  body: { },
  title: { color: colors.text, fontSize: sz(24, 30), fontWeight: '900', letterSpacing: -0.5 },
  versions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  versionOld: { color: colors.muted, fontSize: sz(13.5, 16), fontWeight: '600' },
  versionNew: { color: colors.accent, fontSize: sz(13.5, 16), fontWeight: '800' },
  size: { color: colors.muted, fontSize: sz(13.5, 16) },
  notes: { marginTop: 18, gap: 9 },
  notesHeading: { color: colors.text, fontSize: sz(14, 17), fontWeight: '800', marginBottom: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  noteText: { flex: 1, color: colors.muted, fontSize: sz(13.5, 16), lineHeight: sz(19, 23) },
  progressBlock: { marginTop: 20, gap: 10 },
  progressText: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressLabel: { color: colors.text, fontSize: sz(14.5, 17), fontWeight: '700', flexShrink: 1 },
  progressValue: { color: colors.accent, fontSize: sz(20, 24), fontWeight: '900' },
  track: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  // Grows from the left edge as the download comes in.
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transformOrigin: 'left' },
  hint: { color: colors.muted, fontSize: sz(12.5, 15), lineHeight: sz(18, 21) },
  errorText: { color: colors.text, fontSize: sz(14.5, 17), fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  button: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  buttonQuiet: { backgroundColor: colors.surfaceRaised },
  buttonFocused: { borderColor: '#fff', transform: [{ scale: 1.04 }] },
  buttonPressed: { opacity: 0.85 },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: sz(14, 16),
  },
  buttonText: { color: '#fff', fontSize: sz(15, 18), fontWeight: '800' },
  buttonTextQuiet: { color: colors.text },
});
