// The phone's bottom navigation bar: a floating pill of frosted glass that
// blurs the screen behind it. The other tabs are just icons; the selected one
// opens into a purple pill with its icon and name, and springs across when
// another is chosen. TVs use the tabs at the top instead.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  type GestureResponderHandlers,
  LayoutAnimation,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadCount, useIsAdmin } from '../chat/store';
import { useDownloads } from '../data/downloads';
import { useNavHidden } from '../data/navChrome';
import { Badge } from '../chat/ui';
import { colors } from '../theme';

export type NavId = 'home' | 'search' | 'favorites' | 'downloads' | 'history' | 'chat' | 'settings' | 'admin';

export type NavItem = {
  id: NavId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

const BASE_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { id: 'search', label: 'Search', icon: 'search-outline', activeIcon: 'search' },
  { id: 'favorites', label: 'Favorites', icon: 'heart-outline', activeIcon: 'heart' },
  { id: 'downloads', label: 'Downloads', icon: 'arrow-down-circle-outline', activeIcon: 'arrow-down-circle' },
  { id: 'history', label: 'History', icon: 'time-outline', activeIcon: 'time' },
  { id: 'chat', label: 'Chat', icon: 'chatbubbles-outline', activeIcon: 'chatbubbles' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export const BOTTOM_NAV_HEIGHT = 64;

// The selected tab's pill opening and the others making room, as one spring.
const SWITCH = {
  duration: 380,
  create: { type: LayoutAnimation.Types.spring, property: LayoutAnimation.Properties.scaleXY, springDamping: 0.75 },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.75 },
  delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity, duration: 120 },
};

type Props = {
  active: NavId;
  onSelect: (id: NavId) => void;
  // The screens behind the bar, which its glass blurs (Android).
  blurTarget?: RefObject<View | null>;
};

export function BottomNav({ active, onSelect, blurTarget }: Props) {
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();
  const downloads = useDownloads();
  const activeDownloads = downloads.filter((d) => d.status === 'downloading').length;
  const isAdmin = useIsAdmin();

  const items = useMemo(() => {
    const list = [...BASE_ITEMS];
    if (isAdmin) {
      list.push({
        id: 'admin',
        label: 'Analytics',
        icon: 'stats-chart-outline',
        activeIcon: 'stats-chart',
      });
    }
    return list;
  }, [isAdmin]);

  // Tucked below the screen edge while the user scrolls down through a list.
  const hidden = useNavHidden();
  const [slide] = useState(() => new Animated.Value(0));
  const [dragX] = useState(() => new Animated.Value(0));
  // How far the bar travels to clear the edge, its padding and its shadow.
  const travel = BOTTOM_NAV_HEIGHT + insets.bottom + 34;
  useEffect(() => {
    // A spring easing to rest reads as a glide; the slide and the fade both
    // come from one 0..1 value so they move together.
    Animated.spring(slide, {
      toValue: hidden ? 1 : 0,
      speed: 12,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  }, [hidden, slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  const opacity = slide.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.55, 0] });

  const select = (id: NavId) => {
    if (id !== active) LayoutAnimation.configureNext(SWITCH);
    onSelect(id);
  };

  const propsRef = useRef({ active, items, onSelect });
  useEffect(() => {
    propsRef.current = { active, items, onSelect };
  });

  const startIndexRef = useRef<number>(0);
  const lastSwipedIndexRef = useRef<number>(-1);
  const hasSwitchedRef = useRef<boolean>(false);

  const [panHandlers, setPanHandlers] = useState<GestureResponderHandlers | undefined>(undefined);

  useEffect(() => {
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy);
      },
      onPanResponderGrant: () => {
        const { active: curActive, items: curItems } = propsRef.current;
        const currentIdx = curItems.findIndex((it) => it.id === curActive);
        startIndexRef.current = currentIdx >= 0 ? currentIdx : 0;
        lastSwipedIndexRef.current = startIndexRef.current;
        hasSwitchedRef.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        const { items: curItems, onSelect: curOnSelect } = propsRef.current;
        const startIdx = startIndexRef.current;
        const STEP_DISTANCE = 42;

        // Subtle elastic drag translation for visual responsiveness
        dragX.setValue(Math.min(16, Math.max(-16, gesture.dx * 0.2)));

        // Swiping left (gesture.dx < 0): moves to the left tab (-1, -2...)
        // Swiping right (gesture.dx > 0): moves to the right tab (+1, +2...)
        const stepOffset = Math.round(gesture.dx / STEP_DISTANCE);
        const targetIdx = Math.max(0, Math.min(curItems.length - 1, startIdx + stepOffset));

        if (targetIdx !== lastSwipedIndexRef.current) {
          lastSwipedIndexRef.current = targetIdx;
          hasSwitchedRef.current = true;
          LayoutAnimation.configureNext(SWITCH);
          curOnSelect(curItems[targetIdx].id);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        Animated.spring(dragX, { toValue: 0, speed: 24, bounciness: 4, useNativeDriver: true }).start();

        const { items: curItems, onSelect: curOnSelect } = propsRef.current;
        const startIdx = startIndexRef.current;

        // If continuous drag hasn't stepped yet, check for a quick flick/swipe
        if (!hasSwitchedRef.current) {
          // Swiped right: move to right tab
          if (gesture.dx > 25 || gesture.vx > 0.3) {
            const nextIdx = Math.min(curItems.length - 1, startIdx + 1);
            if (nextIdx !== startIdx) {
              LayoutAnimation.configureNext(SWITCH);
              curOnSelect(curItems[nextIdx].id);
            }
          }
          // Swiped left: move to left tab
          else if (gesture.dx < -25 || gesture.vx < -0.3) {
            const prevIdx = Math.max(0, startIdx - 1);
            if (prevIdx !== startIdx) {
              LayoutAnimation.configureNext(SWITCH);
              curOnSelect(curItems[prevIdx].id);
            }
          }
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, speed: 24, bounciness: 4, useNativeDriver: true }).start();
      },
    });

    setPanHandlers(pan.panHandlers);
  }, [dragX]);

  return (
    <Animated.View
      style={[styles.bar, { paddingBottom: insets.bottom + 10, opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[styles.shadow, { transform: [{ translateX: dragX }] }]}
        {...panHandlers}
      >
        <BlurView
          intensity={60}
          tint="dark"
          blurTarget={blurTarget}
          // GPU blur on Android 12 and newer; older phones get tinted glass.
          blurMethod="dimezisBlurViewSdk31Plus"
          style={styles.glass}
        >
          <LinearGradient
            // A light sheen along the top edge of the glass.
            colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
            locations={[0, 0.5]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {items.map((item) => (
            <Tab
              key={item.id}
              item={item}
              on={item.id === active}
              badge={item.id === 'chat' ? unread : item.id === 'downloads' ? activeDownloads : 0}
              onPress={() => select(item.id)}
            />
          ))}
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
}

function Tab({
  item,
  on,
  badge,
  onPress,
}: {
  item: NavItem;
  on: boolean;
  badge: number;
  onPress: () => void;
}) {
  const [press] = useState(() => new Animated.Value(1));
  const squeeze = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();

  const icon = (
    <View>
      <Ionicons name={on ? item.activeIcon : item.icon} size={22} color={on ? '#fff' : colors.muted} />
      {badge > 0 && <Badge count={badge} style={styles.badge} />}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => squeeze(0.9)}
      onPressOut={() => squeeze(1)}
      style={[styles.item, on && styles.itemOn]}
      hitSlop={4}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={item.label}
    >
      <Animated.View style={{ transform: [{ scale: press }] }}>
        {on ? (
          <LinearGradient
            colors={['#b07cff', colors.accent, colors.accentDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pill}
          >
            {icon}
            <Text style={styles.pillLabel} numberOfLines={1}>
              {item.label}
            </Text>
          </LinearGradient>
        ) : (
          <View style={styles.plain}>{icon}</View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  shadow: {
    marginHorizontal: 10,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BOTTOM_NAV_HEIGHT,
    paddingHorizontal: 4,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    // Tints the glass, and is the whole look where blur isn't available.
    backgroundColor: 'rgba(22,18,32,0.62)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  itemOn: { flex: 2.0 },
  plain: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pillLabel: { color: '#fff', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
  badge: { position: 'absolute', top: -7, right: -12, borderWidth: 2, borderColor: '#1a1626' },
});
