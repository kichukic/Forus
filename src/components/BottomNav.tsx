// The phone's bottom navigation bar. TVs use the tabs at the top instead.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadCount } from '../chat/store';
import { Badge } from '../chat/ui';
import { colors } from '../theme';

export type NavId = 'home' | 'search' | 'history' | 'chat' | 'settings';

const ITEMS: { id: NavId; label: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { id: 'search', label: 'Search', icon: 'search-outline', activeIcon: 'search' },
  { id: 'history', label: 'History', icon: 'time-outline', activeIcon: 'time' },
  { id: 'chat', label: 'Chat', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export const BOTTOM_NAV_HEIGHT = 64;

export function BottomNav({ active, onSelect }: { active: NavId; onSelect: (id: NavId) => void }) {
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();
  return (
    <LinearGradient
      colors={['rgba(12,10,18,0)', 'rgba(12,10,18,0.96)', colors.background]}
      locations={[0, 0.35, 1]}
      style={[styles.bar, { paddingBottom: insets.bottom + 6 }]}
    >
      <View style={styles.inner}>
        {ITEMS.map((item) => {
          const on = item.id === active;
          return (
            <Pressable key={item.id} onPress={() => onSelect(item.id)} style={styles.item} hitSlop={6}>
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Ionicons name={on ? item.activeIcon : item.icon} size={22} color={on ? colors.accent : colors.muted} />
                {item.id === 'chat' && unread > 0 && <Badge count={unread} style={styles.badge} />}
              </View>
              <Text style={[styles.label, on && styles.labelOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 18 },
  inner: {
    flexDirection: 'row',
    height: BOTTOM_NAV_HEIGHT,
    marginHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { paddingHorizontal: 14, paddingVertical: 3, borderRadius: 14 },
  iconWrapOn: { backgroundColor: colors.accentSoft },
  badge: { position: 'absolute', top: -4, right: 4 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },
  labelOn: { color: colors.accent, fontWeight: '800' },
});
