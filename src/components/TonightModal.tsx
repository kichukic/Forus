// "Tonight": a short set of choices, then one film picked by the concierge.
// It searches MovieBox for the pick so the answer can be watched immediately.
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MovieboxSubject } from '../api/moviebox';
import { findMovieboxSubject } from '../chat/ai';
import { aiTonight, ChatError, type AiTonightPick } from '../chat/api';
import { colors, GUTTER, sz } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenMoviebox: (subject: MovieboxSubject) => void;
  recentTitles: string[];
};

const MOODS = [
  { value: '', label: 'Surprise me' },
  { value: 'cozy and comforting', label: 'Cozy' },
  { value: 'tense and thrilling', label: 'Thrilling' },
  { value: 'funny and light', label: 'Funny' },
  { value: 'romantic and warm', label: 'Romantic' },
  { value: 'mind-bending', label: 'Mind-bending' },
  { value: 'feel-good and uplifting', label: 'Feel-good' },
];

const LENGTHS = [
  { value: undefined, label: 'Any length' },
  { value: 90, label: 'Under 90 min' },
  { value: 120, label: 'Under 2 hours' },
  { value: 180, label: 'Epic' },
];

const COMPANIES = [
  { value: undefined, label: 'Anyone' },
  { value: 'alone' as const, label: 'Solo' },
  { value: 'partner' as const, label: 'Partner' },
  { value: 'friends' as const, label: 'Friends' },
  { value: 'family' as const, label: 'Family' },
];

const LANGUAGES = ['Any language', 'Malayalam', 'Hindi', 'English', 'Tamil', 'Telugu', 'Korean'];

export function TonightBanner({ onPress }: { onPress: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.bannerWrap}>
      <Pressable
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel="Open the Tonight film concierge"
        style={[styles.banner, focused && styles.bannerFocused]}
      >
        <LinearGradient
          colors={['#3a1a66', '#21122f', '#171321']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bannerIcon}>
          <Ionicons name="sparkles" size={sz(22, 27)} color="#ffd166" />
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerEyebrow}>TONIGHT · AI CONCIERGE</Text>
          <Text style={styles.bannerTitle}>What should we watch?</Text>
          <Text style={styles.bannerSub}>Tell us the mood. We&apos;ll pick one.</Text>
        </View>
        <View style={styles.bannerArrow}>
          <Ionicons name="arrow-forward" size={sz(18, 22)} color={colors.text} />
        </View>
      </Pressable>
    </View>
  );
}

export function TonightModal({ visible, onClose, onOpenMoviebox, recentTitles }: Props) {
  const insets = useSafeAreaInsets();
  const [mood, setMood] = useState('');
  const [minutes, setMinutes] = useState<number | undefined>(undefined);
  const [company, setCompany] = useState<'alone' | 'partner' | 'friends' | 'family' | undefined>(undefined);
  const [language, setLanguage] = useState('Any language');
  const [pick, setPick] = useState<AiTonightPick | null>(null);
  const [subject, setSubject] = useState<MovieboxSubject | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const close = () => {
    request.current++;
    setLoading(false);
    setResolving(false);
    setPick(null);
    setSubject(null);
    setError(null);
    onClose();
  };

  const find = async () => {
    const id = ++request.current;
    setLoading(true);
    setResolving(false);
    setPick(null);
    setSubject(null);
    setError(null);
    try {
      const result = await aiTonight({
        mood: mood || undefined,
        minutes,
        company,
        language: language === 'Any language' ? undefined : language,
        recentTitles: recentTitles.slice(0, 6),
      });
      if (request.current !== id) return;
      setPick(result);
      setLoading(false);
      setResolving(true);
      const match = await findMovieboxSubject(result);
      if (request.current !== id) return;
      setSubject(match);
      setResolving(false);
    } catch (e) {
      if (request.current !== id) return;
      setLoading(false);
      setResolving(false);
      setError(
        e instanceof ChatError && e.status === 404
          ? "Tonight isn't available on this server yet. Try again after the backend is updated."
          : e instanceof ChatError
            ? e.message
            : "Couldn't find a pick just now. Check your connection and try again.",
      );
    }
  };

  const watch = () => {
    if (!subject) return;
    const chosen = subject;
    close();
    onOpenMoviebox(chosen);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + sz(16, 20) }]}>
          <View style={styles.grabber} />
          <View style={styles.topRow}>
            <View style={styles.titleRow}>
              <Ionicons name="sparkles" size={sz(19, 23)} color="#ffd166" />
              <Text style={styles.title}>Tonight</Text>
            </View>
            <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close Tonight" style={styles.close}>
              <Ionicons name="close" size={sz(21, 25)} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.intro}>One good pick, no endless scrolling.</Text>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ChoiceGroup
              label="MOOD"
              options={MOODS}
              value={mood}
              onChange={(value) => setMood(String(value ?? ''))}
            />
            <ChoiceGroup
              label="TIME"
              options={LENGTHS}
              value={minutes}
              onChange={(value) => setMinutes(value as number | undefined)}
              compact
            />
            <ChoiceGroup
              label="WATCHING WITH"
              options={COMPANIES}
              value={company}
              onChange={(value) => setCompany(value as typeof company)}
              compact
            />
            <ChoiceGroup
              label="LANGUAGE"
              options={LANGUAGES.map((value) => ({ value, label: value === 'Any language' ? 'Any' : value }))}
              value={language}
              onChange={(value) => setLanguage(String(value))}
            />

            <Pressable
              onPress={find}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Find tonight's pick"
              style={({ pressed }) => [styles.find, (pressed || loading) && styles.pressed]}
            >
              <LinearGradient
                colors={['#b478ff', '#7d3ff0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="sparkles" size={sz(18, 21)} color="#fff" />
              )}
              <Text style={styles.findText}>{loading ? 'Reading the room…' : pick ? 'Pick again' : 'Find my film'}</Text>
            </Pressable>

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="cloud-offline-outline" size={sz(22, 26)} color={colors.live} />
                <Text style={styles.errorText}>{error}</Text>
                <Pressable onPress={find} disabled={loading} style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : pick ? (
              <View style={styles.result}>
                <Text style={styles.resultEyebrow}>TONIGHT&apos;S PICK</Text>
                <View style={styles.resultMain}>
                  <View style={styles.poster}>
                    {subject?.poster || subject?.backdrop ? (
                      <Image
                        source={subject.poster || subject.backdrop}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={180}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <LinearGradient colors={[colors.accentDeep, '#1b1230']} style={StyleSheet.absoluteFill}>
                        <Ionicons
                          name={pick.kind === 'series' ? 'tv-outline' : 'film-outline'}
                          size={sz(30, 38)}
                          color="rgba(255,255,255,0.65)"
                        />
                      </LinearGradient>
                    )}
                  </View>
                  <View style={styles.resultText}>
                    <Text style={styles.pickTitle} numberOfLines={3}>
                      {pick.title}
                    </Text>
                    <Text style={styles.pickMeta}>
                      {[pick.year, pick.kind === 'series' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}
                    </Text>
                    {pick.reason ? <Text style={styles.reason}>{pick.reason}</Text> : null}
                  </View>
                </View>

                {resolving ? (
                  <View style={styles.resolving}>
                    <ActivityIndicator color={colors.accent} size="small" />
                    <Text style={styles.resolvingText}>Looking for it on MovieBox…</Text>
                  </View>
                ) : subject ? (
                  <View style={styles.actions}>
                    <Pressable onPress={watch} style={({ pressed }) => [styles.watch, pressed && styles.pressed]}>
                      <Ionicons name="play" size={sz(17, 20)} color="#0c0a12" />
                      <Text style={styles.watchText}>Watch on ForUs</Text>
                    </Pressable>
                    <Pressable onPress={find} style={({ pressed }) => [styles.tryAnother, pressed && styles.pressed]}>
                      <Text style={styles.tryAnotherText}>Not feeling it</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <Text style={styles.notFound}>
                      Not on MovieBox right now. Try a different mood, or ask for another pick.
                    </Text>
                    <Pressable onPress={find} style={({ pressed }) => [styles.tryAnother, pressed && styles.pressed]}>
                      <Text style={styles.tryAnotherText}>Give me another</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            <Text style={styles.footnote}>Picked by AI from your mood. Availability can vary.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ChoiceGroup<T extends string | number | undefined>({
  label,
  options,
  value,
  onChange,
  compact,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={[styles.choices, compact && styles.choicesCompact]}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={`${label}:${option.label}`}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.choice,
                compact && styles.choiceCompact,
                selected && styles.choiceSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { paddingHorizontal: GUTTER, marginBottom: sz(22, 28) },
  banner: {
    minHeight: sz(92, 112),
    borderRadius: sz(18, 22),
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: sz(12, 16),
    paddingHorizontal: sz(15, 20),
    paddingVertical: sz(14, 18),
    borderWidth: 2,
    borderColor: 'rgba(180,120,255,0.32)',
  },
  bannerFocused: { borderColor: colors.accent },
  bannerIcon: {
    width: sz(46, 58),
    height: sz(46, 58),
    borderRadius: sz(23, 29),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,209,102,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,209,102,0.25)',
  },
  bannerText: { flex: 1 },
  bannerEyebrow: { color: '#d9b8ff', fontSize: sz(9.5, 11.5), fontWeight: '900', letterSpacing: 1.4 },
  bannerTitle: { color: '#fff', fontSize: sz(18, 23), fontWeight: '900', marginTop: 3 },
  bannerSub: { color: colors.muted, fontSize: sz(12.5, 15), marginTop: 2 },
  bannerArrow: {
    width: sz(34, 42),
    height: sz(34, 42),
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.68)' },
  sheet: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    alignSelf: 'center',
    backgroundColor: '#14101f',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: GUTTER,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
    marginBottom: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: sz(24, 29), fontWeight: '900', letterSpacing: -0.4 },
  close: {
    width: sz(36, 42),
    height: sz(36, 42),
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  intro: { color: colors.muted, fontSize: sz(13, 15), marginTop: 3, marginBottom: sz(16, 20) },
  content: { paddingBottom: sz(6, 10) },
  group: { marginBottom: sz(16, 20) },
  groupLabel: {
    color: colors.faint,
    fontSize: sz(10, 12),
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: sz(8, 10),
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: sz(8, 10) },
  choicesCompact: { gap: sz(6, 8) },
  choice: {
    paddingHorizontal: sz(13, 16),
    paddingVertical: sz(8, 10),
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceCompact: { paddingHorizontal: sz(11, 14), paddingVertical: sz(6, 8) },
  choiceSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  choiceText: { color: colors.muted, fontSize: sz(12.5, 14.5), fontWeight: '700' },
  choiceTextSelected: { color: '#fff' },
  find: {
    minHeight: sz(48, 56),
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: sz(2, 4),
  },
  findText: { color: '#fff', fontSize: sz(15, 17), fontWeight: '900' },
  pressed: { opacity: 0.7 },
  errorCard: {
    marginTop: sz(16, 20),
    padding: sz(14, 18),
    borderRadius: 16,
    backgroundColor: 'rgba(255,59,92,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,92,0.3)',
    gap: 8,
  },
  errorText: { color: colors.text, fontSize: sz(13, 15), lineHeight: sz(19, 22) },
  retry: { alignSelf: 'flex-start', marginTop: 2 },
  retryText: { color: colors.accent, fontSize: sz(13, 15), fontWeight: '800' },
  result: {
    marginTop: sz(18, 22),
    padding: sz(15, 19),
    borderRadius: sz(18, 22),
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(180,120,255,0.35)',
  },
  resultEyebrow: { color: '#d9b8ff', fontSize: sz(10, 12), fontWeight: '900', letterSpacing: 1.5 },
  resultMain: { flexDirection: 'row', gap: sz(12, 16), marginTop: sz(10, 12) },
  poster: {
    width: sz(76, 96),
    height: sz(114, 144),
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  resultText: { flex: 1, justifyContent: 'center' },
  pickTitle: { color: '#fff', fontSize: sz(20, 24), fontWeight: '900', lineHeight: sz(25, 30) },
  pickMeta: { color: colors.accent, fontSize: sz(12, 14), fontWeight: '800', marginTop: 4 },
  reason: { color: colors.muted, fontSize: sz(13, 15), lineHeight: sz(19, 22), marginTop: 8 },
  resolving: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  resolvingText: { color: colors.muted, fontSize: sz(12.5, 14.5) },
  actions: { marginTop: sz(14, 18), gap: 10 },
  watch: {
    minHeight: sz(44, 52),
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.accent,
  },
  watchText: { color: '#0c0a12', fontSize: sz(14.5, 16.5), fontWeight: '900' },
  tryAnother: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  tryAnotherText: { color: colors.muted, fontSize: sz(13, 15), fontWeight: '700' },
  notFound: { color: colors.muted, fontSize: sz(12.5, 14.5), lineHeight: sz(18, 21), textAlign: 'center' },
  footnote: { color: colors.faint, fontSize: sz(10.5, 12.5), textAlign: 'center', marginTop: sz(18, 24) },
});
